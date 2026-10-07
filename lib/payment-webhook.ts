import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { JODO_NOTE_REF_KEY, JODO_WEBHOOK_PRODUCTION_IPS, verifyJodoSignature } from "@/lib/jodo";
import { creditPaymentOrder } from "@/lib/run-online-topup";
import { isAllowedWebhookIp, isPaidEvent, parseIpAllowlist, parseJodoWebhookEvent } from "@/services/payment-webhook";

/**
 * Jodo webhook handling (docs.jodo.in/webhooks/handling-webhook-events):
 * validate the source → persist the event → act idempotently → answer fast.
 *
 * Response discipline matters more than usual here: Jodo retries non-2xx up to
 * 5 times over ~3 days and auto-disables the subscription after 100 consecutive
 * failures. So we return 2xx for everything we have *consciously decided* not to
 * act on (duplicate, unknown order, irrelevant event) and non-2xx only when a
 * retry could genuinely help (our DB failed) or must not be trusted (bad
 * signature / source).
 */
export type WebhookOutcome =
  | "credited"
  | "already_credited"
  | "settled"
  | "ignored" // event we don't act on (unpaid status, unknown event code, …)
  | "unknown_order"
  | "duplicate";

export type WebhookResult = { status: number; body: { ok: boolean; outcome?: WebhookOutcome; error?: string } };

const ok = (outcome: WebhookOutcome): WebhookResult => ({ status: 200, body: { ok: true, outcome } });
const reject = (status: number, error: string): WebhookResult => ({ status, body: { ok: false, error } });

export async function handleJodoWebhook(rawBody: string, headers: Headers): Promise<WebhookResult> {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return reject(400, "Invalid JSON.");
  }
  const event = parseJodoWebhookEvent(json);
  if (!event) {
    // Not an order event (or malformed) — nothing to retry.
    console.warn("Jodo webhook: unrecognised body shape; ignored");
    return ok("ignored");
  }

  // Resolve the order first: the signing secret is per branch, so the order
  // tells us which secret to verify with.
  const order = await prisma.paymentOrder.findUnique({ where: { jodoOrderId: event.orderId } });
  if (!order) {
    console.warn("Jodo webhook: no payment order for", event.orderId, event.event);
    return ok("unknown_order");
  }

  const secret = (await prisma.paymentConfig.findUnique({ where: { branchId: order.branchId } }))?.webhookSecret;
  if (!secret) {
    // Misconfiguration (webhook registered without the secret stored). A retry
    // CAN succeed once the secret is set, so let Jodo retry — and shout.
    console.error("Jodo webhook: no webhook_secret for branch", order.branchId.toString());
    return reject(503, "Webhook secret not configured.");
  }
  if (!verifyJodoSignature(secret, rawBody, headers.get("x-jodo-signature"))) {
    console.error("Jodo webhook: bad signature for", event.orderId);
    return reject(401, "Invalid signature.");
  }

  const allowlist = parseIpAllowlist(process.env.JODO_WEBHOOK_IP_ALLOWLIST, JODO_WEBHOOK_PRODUCTION_IPS);
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || null;
  if (!isAllowedWebhookIp(ip, allowlist)) {
    console.error("Jodo webhook: source IP not allowed", ip);
    return reject(403, "Source not allowed.");
  }

  // Second key: the ref we sent in `notes` must match the order we resolved.
  // (Only enforced when present — pre-notes orders have no echo.)
  const ref = event.notes[JODO_NOTE_REF_KEY];
  if (ref && ref !== order.clientUuid) {
    console.error("Jodo webhook: notes ref mismatch", { orderId: event.orderId, ref });
    return ok("ignored");
  }

  // Persist before acting (audit + replay). A retried delivery has the same
  // event_id → P2002 → we've already seen it. If the first attempt died before
  // `processed_at` was set, fall through and process it now.
  try {
    await prisma.paymentWebhookEvent.create({
      data: {
        eventId: event.eventId,
        eventCode: event.event,
        jodoOrderId: event.orderId,
        paymentOrderId: order.id,
        payload: json as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const seen = await prisma.paymentWebhookEvent.findUnique({ where: { eventId: event.eventId } });
      if (seen?.processedAt) return ok("duplicate");
    } else {
      throw e;
    }
  }

  const finish = async (outcome: WebhookOutcome, error?: string) => {
    await prisma.paymentWebhookEvent.update({
      where: { eventId: event.eventId },
      data: { processedAt: new Date(), outcome, error: error?.slice(0, 500) ?? null },
    });
  };

  try {
    if (isPaidEvent(event)) {
      const credit = await creditPaymentOrder(order, null, { paidAt: event.paidAt });
      if (!credit.ok) {
        // Paid but we couldn't credit (e.g. a meal lost its rate). Record it and
        // let Jodo retry; reconcile also self-heals from this stored event.
        await finish("ignored", credit.error);
        console.error("Jodo webhook: paid but credit failed", event.orderId, credit.error);
        return reject(500, credit.error);
      }
      const outcome: WebhookOutcome = credit.already ? "already_credited" : "credited";
      await finish(outcome);
      return ok(outcome);
    }

    if (event.event === "order.payment.settled") {
      if (event.settlementUtr && order.settlementUtr !== event.settlementUtr) {
        await prisma.paymentOrder.update({ where: { id: order.id }, data: { settlementUtr: event.settlementUtr } });
      }
      await finish("settled");
      return ok("settled");
    }

    await finish("ignored");
    return ok("ignored");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish("ignored", msg).catch(() => {});
    console.error("Jodo webhook: processing error", event.orderId, e);
    return reject(500, "Processing failed.");
  }
}
