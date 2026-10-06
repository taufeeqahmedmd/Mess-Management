import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getJodoOrder, pause, resolveJodoConfig } from "@/lib/jodo";
import { creditPaymentOrder } from "@/lib/run-online-topup";

// A pending order younger than this is still "in flight" — the live redirect
// callback may credit it any second, so we let that happy path run and skip it
// here. (Crediting is idempotent regardless, so this is only an optimisation.)
const MIN_AGE_MS = 2 * 60_000; // 2 minutes
// A pending order Jodo still doesn't report as paid after this long is treated
// as abandoned and marked failed, so it stops being re-checked on every run.
const STALE_MS = 24 * 60 * 60_000; // 24 hours
// How many pending orders to reconcile per invocation (newest first, so a
// recent paid-but-uncredited order is always settled promptly).
const BATCH = 200;
// Gateway states that mean the order will never be paid.
const TERMINAL_FAIL = new Set(["failed", "expired", "cancelled", "canceled", "declined", "voided"]);
// Jodo answers get-order with 429 (TooManyRequestsError, no Retry-After) —
// observed PER ORDER: the same orders are refused run after run while others
// in the same sweep succeed. So a 429 skips only that order (the next run is
// its backoff) and never stops the sweep, or one throttled order would starve
// every order behind it. Calls are still paced so the sweep is never a burst.
const GAP_MS = 500;
// Stop starting new checks after this long, so a run finishes inside nginx's
// 60s proxy_read_timeout (the cron calls through nginx). The rest wait for the
// next run.
const RUN_BUDGET_MS = 40_000;

/**
 * POST /api/payments/reconcile — settle online top-ups whose redirect callback
 * never fired (the payer closed the tab or lost network after paying, so
 * `/api/public/pay/callback` never ran). For each still-`pending` order we
 * re-verify with Jodo and, if paid, credit the coupons through the SAME
 * idempotent `creditPaymentOrder` the callback uses — so a race with a late
 * callback can never double-credit. Orders the gateway reports as terminally
 * failed, or that have been pending past the stale cutoff, are marked `failed`
 * so they aren't re-checked forever.
 *
 * Intended for the server's scheduler, every few minutes:
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" https://…/api/payments/reconcile
 * Also runnable by a logged-in actor holding `recharge.create` (manual sweep).
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
  const now = startedAt;
  const pending = await prisma.paymentOrder.findMany({
    where: { status: "pending", createdAt: { lte: new Date(now - MIN_AGE_MS) } },
    orderBy: { createdAt: "desc" },
    take: BATCH,
  });

  let credited = 0;
  let alreadyCredited = 0;
  let stillPending = 0;
  let failed = 0;
  // Each errored order stays pending and is retried next run. The reason is
  // logged and returned (payment-order id + gateway status/message — no
  // credentials) so a stuck order is diagnosable from the cron log alone.
  const errors: { id: string; reason: string }[] = [];
  const fail = (order: { id: bigint; jodoOrderId: string }, reason: string) => {
    errors.push({ id: order.id.toString(), reason });
    console.error("reconcile error:", order.jodoOrderId, reason);
  };

  // Orders not examined this run (time budget spent). They stay pending and are
  // picked up by the next run.
  let deferred = 0;
  let gatewayCalls = 0;

  for (let i = 0; i < pending.length; i++) {
    const order = pending[i];
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      deferred = pending.length - i;
      break;
    }
    try {
      // Verify against the order's own branch gateway (no env fallback). If the
      // branch is no longer configured, leave the order pending for a later run.
      const cfg = await resolveJodoConfig(order.branchId);
      if (!cfg) {
        fail(order, `branch ${order.branchId} has no complete payment config`);
        continue;
      }
      if (gatewayCalls++ > 0) await pause(GAP_MS);
      const res = await getJodoOrder(cfg, order.jodoOrderId);
      if (!res.ok) {
        // Gateway unreachable / errored for this order — leave it pending and
        // let the next run retry. Don't mark it failed on a transient error.
        fail(order, `get-order ${res.status ?? "unreachable"}: ${res.error}`);
        continue;
      }

      if (res.paid) {
        const credit = await creditPaymentOrder(order, res.transactionId);
        if (credit.ok) {
          if (credit.already) alreadyCredited++;
          else credited++;
        } else {
          // Paid but couldn't credit (e.g. a meal lost its current rate) — keep
          // it pending so a later run retries once the config is fixed.
          fail(order, `paid but credit failed: ${credit.error}`);
        }
        continue;
      }

      const terminal = res.orderStatus != null && TERMINAL_FAIL.has(res.orderStatus.toLowerCase());
      const stale = order.createdAt.getTime() <= now - STALE_MS;
      if (terminal || stale) {
        await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: "failed" } });
        failed++;
      } else {
        // Still legitimately in progress (created/pending at the gateway).
        stillPending++;
      }
    } catch (e) {
      fail(order, `exception: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    checked: pending.length - deferred,
    credited,
    alreadyCredited,
    stillPending,
    failed,
    errored: errors.length,
    deferred,
    errors,
  });
}
