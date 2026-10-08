import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getJodoOrder, pause, resolveJodoConfig } from "@/lib/jodo";
import { creditPaymentOrder } from "@/lib/run-online-topup";
import {
  isPaidEvent,
  nextReconcileAt,
  parseJodoWebhookEvent,
  paymentHealthAlert,
  RECONCILE_BACKOFF_MINUTES,
  STUCK_AFTER_CHECKS,
} from "@/services/payment-webhook";
import { raisePaymentAlert } from "@/lib/payment-alerts";

// A pending order Jodo still doesn't report as paid after this long is treated
// as abandoned and marked failed, so it stops being re-checked. Matches Jodo's
// own webhook retry horizon (~3 days), after which no delivery will ever come.
const STALE_MS = 3 * 24 * 60 * 60_000;
// Orders examined per run. Backoff keeps the due set small; this only bounds a
// pathological backlog so a run always finishes inside nginx's 60s timeout.
const BATCH = 60;
// Gateway states that mean the order will never be paid.
const TERMINAL_FAIL = new Set(["failed", "expired", "cancelled", "canceled", "declined", "voided"]);
// Jodo rate-limits get-order (429, no published limit). Calls are paced and a
// 429 just pushes that order to its next backoff slot — never a retry burst.
const GAP_MS = 500;
const RUN_BUDGET_MS = 40_000;

/**
 * POST /api/payments/reconcile — the SAFETY NET behind Jodo's webhooks. The
 * webhook (`/api/public/pay/webhook`) is how online top-ups normally get
 * credited; this job exists for the rare order whose webhook never arrived.
 *
 * Per due order (status pending, `next_check_at` passed):
 *   1. Self-heal: if a paid `order.payment.debited` event is already stored for
 *      it (receipt succeeded but crediting failed), credit from the event — no
 *      gateway call.
 *   2. Otherwise ONE get-order call, paced. Paid → credit through the same
 *      idempotent `creditPaymentOrder` the webhook uses (a late webhook can
 *      never double-credit). Unpaid → reschedule with exponential backoff
 *      (15m → 1h → 6h → 24h); terminal or > 3 days old → mark failed.
 *
 * Also reports webhook health so a dead subscription is visible in the cron log
 * (events received in the last 24h, orders pending past their first check), and
 * raises a staff alert (`payments.webhook_alert`, ≤ 1 per 6h) when the webhook
 * looks dead, a paid order had to be credited by polling, or orders are stuck.
 *
 * Scheduler: every 5 minutes with `x-cron-secret: $CRON_SECRET`; also runnable
 * by a logged-in actor holding `recharge.create` (manual sweep).
 */
export async function POST(req: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const bySecret = Boolean(secret) && req.headers.get("x-cron-secret") === secret;
  if (!bySecret) {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!can(actor, "recharge.create")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const startedAt = Date.now();
  const now = new Date(startedAt);
  const due = await prisma.paymentOrder.findMany({
    where: { status: "pending", OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: now } }] },
    orderBy: [{ nextCheckAt: "asc" }, { createdAt: "asc" }],
    take: BATCH,
  });

  let credited = 0;
  let alreadyCredited = 0;
  let healed = 0;
  let stillPending = 0;
  let failed = 0;
  let deferred = 0;
  // Each errored order stays pending and is retried at its next backoff slot.
  // The reason is logged and returned (order id + gateway status/message — no
  // credentials) so a stuck order is diagnosable from the cron log alone.
  const errors: { id: string; reason: string }[] = [];
  let stuckOrders = 0;
  const fail = (order: { id: bigint; jodoOrderId: string; checkCount: number }, reason: string) => {
    errors.push({ id: order.id.toString(), reason });
    if (order.checkCount >= STUCK_AFTER_CHECKS) stuckOrders++;
    console.error("reconcile error:", order.jodoOrderId, reason);
  };
  const reschedule = (order: { id: bigint; checkCount: number }) =>
    prisma.paymentOrder.update({
      where: { id: order.id },
      data: { checkCount: { increment: 1 }, nextCheckAt: nextReconcileAt(order.checkCount, now) },
    });

  let gatewayCalls = 0;
  for (let i = 0; i < due.length; i++) {
    const order = due[i];
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      deferred = due.length - i;
      break;
    }
    try {
      // 1. Self-heal from a stored paid event — no gateway call needed.
      const events = await prisma.paymentWebhookEvent.findMany({
        // Debited or settled: either proves payment (see isPaidEvent).
        where: { paymentOrderId: order.id, eventCode: { in: ["order.payment.debited", "order.payment.settled"] } },
        orderBy: { receivedAt: "desc" },
        take: 5,
      });
      const paidEvent = events.map((e) => parseJodoWebhookEvent(e.payload)).find((e) => e && isPaidEvent(e)) ?? null;
      if (paidEvent) {
        const credit = await creditPaymentOrder(order, null, { paidAt: paidEvent.paidAt });
        if (credit.ok) {
          if (credit.already) alreadyCredited++;
          else {
            credited++;
            healed++;
          }
        } else {
          fail(order, `paid (webhook) but credit failed: ${credit.error}`);
          await reschedule(order);
        }
        continue;
      }

      // 2. Ask the gateway — once, paced.
      const cfg = await resolveJodoConfig(order.branchId);
      if (!cfg) {
        fail(order, `branch ${order.branchId} has no complete payment config`);
        await reschedule(order);
        continue;
      }
      if (gatewayCalls++ > 0) await pause(GAP_MS);
      const res = await getJodoOrder(cfg, order.jodoOrderId);
      if (!res.ok) {
        // Unreachable / 429 / errored — leave it pending for its next slot.
        fail(order, `get-order ${res.status ?? "unreachable"}: ${res.error}`);
        await reschedule(order);
        continue;
      }

      if (res.paid) {
        const credit = await creditPaymentOrder(order, res.transactionId);
        if (credit.ok) {
          if (credit.already) alreadyCredited++;
          else credited++;
        } else {
          fail(order, `paid but credit failed: ${credit.error}`);
          await reschedule(order);
        }
        continue;
      }

      const terminal = res.orderStatus != null && TERMINAL_FAIL.has(res.orderStatus.toLowerCase());
      const stale = order.createdAt.getTime() <= startedAt - STALE_MS;
      if (terminal || stale) {
        await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: "failed", nextCheckAt: null } });
        failed++;
      } else {
        await reschedule(order);
        stillPending++;
      }
    } catch (e) {
      fail(order, `exception: ${e instanceof Error ? e.message : String(e)}`);
      await reschedule(order).catch(() => {});
    }
  }

  // Webhook health — the signal that the primary path is alive.
  const firstCheckMs = RECONCILE_BACKOFF_MINUTES[0] * 60_000;
  const dayAgo = new Date(startedAt - 24 * 60 * 60_000);
  const [webhookEventsLast24h, ordersLast24h, pendingPastFirstCheck, oldestPending] = await Promise.all([
    prisma.paymentWebhookEvent.count({ where: { receivedAt: { gte: dayAgo } } }),
    prisma.paymentOrder.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.paymentOrder.count({ where: { status: "pending", createdAt: { lte: new Date(startedAt - firstCheckMs) } } }),
    prisma.paymentOrder.findFirst({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const health = { ordersLast24h, webhookEventsLast24h, creditedBySafetyNet: credited - healed, stuckOrders };
  const alert = paymentHealthAlert(health);
  const alertSent = alert ? await raisePaymentAlert(alert, health) : false;

  return NextResponse.json({
    checked: due.length - deferred,
    credited,
    alreadyCredited,
    healed,
    stillPending,
    failed,
    errored: errors.length,
    deferred,
    errors,
    health: {
      ...health,
      pendingPastFirstCheck,
      oldestPendingAgeMin: oldestPending ? Math.round((startedAt - oldestPending.createdAt.getTime()) / 60_000) : 0,
    },
    alert: alert ? { ...alert, sent: alertSent } : null,
  });
}
