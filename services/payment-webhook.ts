/**
 * Pure (no DB, no network) logic for Jodo payment webhooks and the safety-net
 * poller. Kept here so the money-adjacent decisions — "is this a paid event for
 * our order?", "when do we next ask Jodo?" — are unit-testable in isolation.
 */

/** A Jodo webhook event, normalised from the raw JSON body. */
export type JodoWebhookEvent = {
  eventId: string;
  event: string; // e.g. order.payment.debited
  orderId: string; // Jodo's order id (payment_orders.jodo_order_id)
  orderStatus: string | null; // "paid" | "unpaid" | …
  paidAt: Date | null;
  /** Σ details[].amount as Jodo reports it (float at their JSON boundary). */
  amount: number | null;
  /** First non-empty settlement UTR across details (order.payment.settled). */
  settlementUtr: string | null;
  /** `notes` echoed back from create-order, as a key → value map. */
  notes: Record<string, string>;
};

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Parse a webhook body (docs.jodo.in/pay/webhooks/order-payment-debited). Returns
 * null when the shape isn't a Jodo order event we can act on — the receiver then
 * answers 200 "ignored" so Jodo doesn't retry something we'll never process.
 */
export function parseJodoWebhookEvent(body: unknown): JodoWebhookEvent | null {
  const root = obj(body);
  const eventId = str(root.event_id);
  const event = str(root.event);
  const payload = obj(root.payload);
  const orderId = str(payload.order_id);
  if (!eventId || !event || !orderId) return null;

  const order = obj(payload.order);
  const details = Array.isArray(order.details) ? order.details.map(obj) : [];
  let amount: number | null = null;
  let settlementUtr: string | null = null;
  for (const d of details) {
    const n = typeof d.amount === "number" ? d.amount : Number(d.amount);
    if (Number.isFinite(n)) amount = (amount ?? 0) + n;
    settlementUtr ??= str(d.settlement_utr);
  }

  const notes: Record<string, string> = {};
  if (Array.isArray(order.notes)) {
    for (const n of order.notes.map(obj)) {
      const k = str(n.key);
      const v = str(n.value);
      if (k && v) notes[k] = v;
    }
  }

  const paidAtRaw = str(order.paid_at);
  const paidAt = paidAtRaw ? new Date(paidAtRaw) : null;

  return {
    eventId,
    event,
    orderId,
    orderStatus: str(order.status)?.toLowerCase() ?? null,
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
    amount,
    settlementUtr,
    notes,
  };
}

/** True for a debited event that says the order is paid — the only event that credits. */
export function isPaidEvent(e: JodoWebhookEvent): boolean {
  return e.event === "order.payment.debited" && e.orderStatus === "paid";
}

/**
 * Is `ip` an allowed webhook source? `allowlist` is the configured list;
 * an entry of "any" disables the check (signature verification still applies).
 */
export function isAllowedWebhookIp(ip: string | null, allowlist: readonly string[]): boolean {
  if (allowlist.some((a) => a.trim().toLowerCase() === "any")) return true;
  if (!ip) return false;
  const norm = ip.trim().replace(/^::ffff:/i, ""); // IPv4-mapped IPv6 from some proxies
  return allowlist.some((a) => a.trim() === norm);
}

/** Parse JODO_WEBHOOK_IP_ALLOWLIST-style env into a list; empty/unset → the default. */
export function parseIpAllowlist(env: string | undefined, fallback: readonly string[]): string[] {
  const list = (env ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : [...fallback];
}

// ------------------------------------------------------- safety-net schedule

/**
 * Per-order polling backoff (minutes) for the reconcile safety net. The webhook
 * is the primary path, so the first poll waits long enough for a normal webhook
 * delivery; later polls stretch out so a stuck order costs Jodo a handful of
 * calls over its whole life, never a burst. Index = how many polls have run.
 */
export const RECONCILE_BACKOFF_MINUTES = [15, 60, 6 * 60, 24 * 60] as const;

/** When to poll an order next, given how many polls have already run. */
export function nextReconcileAt(checkCount: number, now: Date): Date {
  const idx = Math.min(Math.max(checkCount, 0), RECONCILE_BACKOFF_MINUTES.length - 1);
  return new Date(now.getTime() + RECONCILE_BACKOFF_MINUTES[idx] * 60_000);
}

/** Delay before an order's *first* poll (gives the webhook its window). */
export function firstReconcileAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + RECONCILE_BACKOFF_MINUTES[0] * 60_000);
}

// ----------------------------------------------------------- health alerts

/** What the safety net observed on one run, for the alert rule. */
export type PaymentHealth = {
  /** payment_orders created in the last 24h (any status). */
  ordersLast24h: number;
  /** Accepted webhook deliveries in the last 24h. */
  webhookEventsLast24h: number;
  /** Orders this run credited via get-order (i.e. their webhook never came). */
  creditedBySafetyNet: number;
  /** Orders that errored this run AND have already been retried several times. */
  stuckOrders: number;
};

export type PaymentAlert = { key: "webhook_dead" | "webhook_missed" | "orders_stuck"; reason: string };

/** How many failed polls before an order counts as "stuck" (≈ 15m+1h+6h in). */
export const STUCK_AFTER_CHECKS = 3;

/**
 * Decide whether a run's observations warrant telling a human. Ordered by
 * severity; returns the first that applies. Pure so the thresholds are tested.
 * Abandoned checkouts (unpaid, pending) are deliberately NOT a signal — they
 * are normal and are reaped at 3 days.
 */
export function paymentHealthAlert(h: PaymentHealth): PaymentAlert | null {
  if (h.ordersLast24h >= 3 && h.webhookEventsLast24h === 0) {
    return {
      key: "webhook_dead",
      reason: `No Jodo webhook deliveries in the last 24h despite ${h.ordersLast24h} new online orders — the subscription may be disabled. Re-run the webhook registration (DEPLOY.md §10).`,
    };
  }
  if (h.creditedBySafetyNet >= 1) {
    return {
      key: "webhook_missed",
      reason: `${h.creditedBySafetyNet} paid order(s) had to be credited by polling — their webhook never arrived. Check the webhook subscription and Jodo's failure emails.`,
    };
  }
  if (h.stuckOrders >= 1) {
    return {
      key: "orders_stuck",
      reason: `${h.stuckOrders} online order(s) can't be verified with Jodo after several attempts. If the dashboard shows them paid, credit them from Reports → Online payments.`,
    };
  }
  return null;
}
