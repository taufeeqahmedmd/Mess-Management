import { describe, it, expect } from "vitest";
import {
  parseJodoWebhookEvent,
  isPaidEvent,
  isAllowedWebhookIp,
  parseIpAllowlist,
  nextReconcileAt,
  firstReconcileAt,
  RECONCILE_BACKOFF_MINUTES,
  paymentHealthAlert,
} from "@/services/payment-webhook";

/**
 * Pure webhook/poller logic (services/payment-webhook) — the decisions that
 * gate crediting: what counts as a paid event, which notes/amount/UTR we read,
 * which source IPs we trust, and when the safety net polls next. Payload shapes
 * are the verbatim examples from docs.jodo.in/pay/webhooks/*.
 */

const debited = {
  event_id: "45bb1387-2a83-4fdb-a149-e7dec81043f0",
  event: "order.payment.debited",
  version: "1.0",
  timestamp: 1691143279,
  payload: {
    order_id: "order_12343532424",
    order: {
      name: "Ron Rivest",
      phone: "9876543210",
      identifier: "STUDENT_IDENTIFIER",
      email: "customer@example.com",
      paid_at: "2023-04-05T07:07:20Z",
      status: "paid",
      details: [{ component_type: "Admission Fee", amount: 10000.0 }],
      notes: [{ key: "erp_reference_id", value: "REF123" }, { key: "mess_ref", value: "11111111-1111-4111-8111-111111111111" }],
    },
  },
};

const settled = {
  event_id: "952aae99-d4f8-481c-9f8b-26bcd403a57a",
  event: "order.payment.settled",
  version: "1.0",
  timestamp: 1692011944,
  payload: {
    order_id: "order_2345343214521452",
    order: {
      paid_at: "2023-04-04T04:00:38Z",
      status: "paid",
      details: [{ component_type: "Admission Fee", amount: 10000.0, settlement_utr: "test_123", settled_at: "2023-04-04T04:00:38Z" }],
      notes: [{ key: "erp_reference_id", value: "REF123" }],
    },
  },
};

describe("parseJodoWebhookEvent", () => {
  it("normalises Jodo's documented debited payload", () => {
    const e = parseJodoWebhookEvent(debited);
    expect(e).toEqual({
      eventId: "45bb1387-2a83-4fdb-a149-e7dec81043f0",
      event: "order.payment.debited",
      orderId: "order_12343532424",
      orderStatus: "paid",
      paidAt: new Date("2023-04-05T07:07:20Z"),
      amount: 10000,
      settlementUtr: null,
      notes: { erp_reference_id: "REF123", mess_ref: "11111111-1111-4111-8111-111111111111" },
    });
  });

  it("reads the settlement UTR from the settled payload", () => {
    const e = parseJodoWebhookEvent(settled);
    expect(e).toMatchObject({ event: "order.payment.settled", settlementUtr: "test_123", amount: 10000 });
  });

  it("sums multi-line details and tolerates string amounts", () => {
    const e = parseJodoWebhookEvent({
      ...debited,
      payload: { ...debited.payload, order: { ...debited.payload.order, details: [{ amount: 60 }, { amount: "35.5" }, { amount: "x" }] } },
    });
    expect(e?.amount).toBe(95.5);
  });

  it("returns null for anything that isn't an order event", () => {
    expect(parseJodoWebhookEvent(null)).toBeNull();
    expect(parseJodoWebhookEvent("str")).toBeNull();
    expect(parseJodoWebhookEvent({ event: "order.payment.debited" })).toBeNull(); // no event_id / order_id
    expect(parseJodoWebhookEvent({ event_id: "e", event: "x", payload: {} })).toBeNull();
  });

  it("lower-cases status, ignores malformed notes and bad dates", () => {
    const e = parseJodoWebhookEvent({
      event_id: "e1",
      event: "order.payment.debited",
      payload: { order_id: "o1", order: { status: "PAID", paid_at: "not-a-date", notes: [{ key: "k" }, "junk", { key: "a", value: "b" }] } },
    });
    expect(e).toMatchObject({ orderStatus: "paid", paidAt: null, notes: { a: "b" }, amount: null });
  });
});

describe("isPaidEvent", () => {
  it("is true for a debited OR settled event whose order is paid (settlement proves payment)", () => {
    expect(isPaidEvent(parseJodoWebhookEvent(debited)!)).toBe(true);
    expect(isPaidEvent(parseJodoWebhookEvent(settled)!)).toBe(true);
    const unpaid = { ...debited, payload: { ...debited.payload, order: { ...debited.payload.order, status: "unpaid" } } };
    expect(isPaidEvent(parseJodoWebhookEvent(unpaid)!)).toBe(false);
  });
});

describe("source IP allowlist", () => {
  const list = ["3.6.234.242", "3.111.80.40"];
  it("matches exact IPs and IPv4-mapped IPv6", () => {
    expect(isAllowedWebhookIp("3.6.234.242", list)).toBe(true);
    expect(isAllowedWebhookIp("::ffff:3.111.80.40", list)).toBe(true);
    expect(isAllowedWebhookIp(" 3.6.234.242 ", list)).toBe(true);
  });
  it("rejects unknown or missing IPs", () => {
    expect(isAllowedWebhookIp("1.2.3.4", list)).toBe(false);
    expect(isAllowedWebhookIp(null, list)).toBe(false);
  });
  it('"any" disables the check', () => {
    expect(isAllowedWebhookIp("1.2.3.4", ["any"])).toBe(true);
    expect(isAllowedWebhookIp(null, ["ANY"])).toBe(true);
  });
  it("parses the env override, falling back to the default", () => {
    expect(parseIpAllowlist(" 1.1.1.1, 2.2.2.2 ,", list)).toEqual(["1.1.1.1", "2.2.2.2"]);
    expect(parseIpAllowlist("", list)).toEqual(list);
    expect(parseIpAllowlist(undefined, list)).toEqual(list);
  });
});

describe("safety-net schedule", () => {
  const now = new Date("2026-10-07T10:00:00Z");
  it("first poll waits for the webhook window", () => {
    expect(firstReconcileAt(now)).toEqual(new Date(now.getTime() + RECONCILE_BACKOFF_MINUTES[0] * 60_000));
  });
  it("backs off 15m → 1h → 6h → 24h and then stays at 24h", () => {
    const mins = (d: Date) => (d.getTime() - now.getTime()) / 60_000;
    expect(mins(nextReconcileAt(0, now))).toBe(15);
    expect(mins(nextReconcileAt(1, now))).toBe(60);
    expect(mins(nextReconcileAt(2, now))).toBe(360);
    expect(mins(nextReconcileAt(3, now))).toBe(1440);
    expect(mins(nextReconcileAt(9, now))).toBe(1440);
    expect(mins(nextReconcileAt(-1, now))).toBe(15);
  });
});

describe("paymentHealthAlert", () => {
  const ok = { ordersLast24h: 10, webhookEventsLast24h: 9, creditedBySafetyNet: 0, stuckOrders: 0 };
  it("is quiet on a healthy day, and on a quiet day with no orders", () => {
    expect(paymentHealthAlert(ok)).toBeNull();
    expect(paymentHealthAlert({ ...ok, ordersLast24h: 0, webhookEventsLast24h: 0 })).toBeNull();
    expect(paymentHealthAlert({ ...ok, ordersLast24h: 2, webhookEventsLast24h: 0 })).toBeNull(); // too few to judge
  });
  it("flags a dead webhook: orders but no deliveries", () => {
    expect(paymentHealthAlert({ ...ok, ordersLast24h: 3, webhookEventsLast24h: 0 })?.key).toBe("webhook_dead");
  });
  it("flags a missed webhook when the safety net had to credit a paid order", () => {
    expect(paymentHealthAlert({ ...ok, creditedBySafetyNet: 1 })?.key).toBe("webhook_missed");
  });
  it("flags stuck orders, and ranks dead > missed > stuck", () => {
    expect(paymentHealthAlert({ ...ok, stuckOrders: 2 })?.key).toBe("orders_stuck");
    expect(paymentHealthAlert({ ordersLast24h: 5, webhookEventsLast24h: 0, creditedBySafetyNet: 1, stuckOrders: 1 })?.key).toBe("webhook_dead");
    expect(paymentHealthAlert({ ...ok, creditedBySafetyNet: 1, stuckOrders: 1 })?.key).toBe("webhook_missed");
  });
});
