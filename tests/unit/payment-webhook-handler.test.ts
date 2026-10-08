import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * Jodo webhook receiver (`lib/payment-webhook`) — the primary path that turns
 * a payment into coupons. Covers the full gate sequence (JSON → shape → order →
 * secret → HMAC over the RAW body → source IP → notes cross-check → persist →
 * idempotent credit) and, just as importantly, the response discipline: 2xx for
 * everything we consciously ignore, non-2xx only for bad auth or our own
 * failure, since Jodo disables the subscription after repeated failures.
 * DB + credit executor mocked at the boundary; the HMAC runs for real.
 */

const orderFindUnique = vi.fn();
const orderUpdate = vi.fn();
const configFindUnique = vi.fn();
const eventCreate = vi.fn();
const eventFindUnique = vi.fn();
const eventUpdate = vi.fn();
const creditPaymentOrder = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentOrder: { findUnique: (...a: unknown[]) => orderFindUnique(...a), update: (...a: unknown[]) => orderUpdate(...a) },
    paymentConfig: { findUnique: (...a: unknown[]) => configFindUnique(...a) },
    paymentWebhookEvent: {
      create: (...a: unknown[]) => eventCreate(...a),
      findUnique: (...a: unknown[]) => eventFindUnique(...a),
      update: (...a: unknown[]) => eventUpdate(...a),
    },
  },
}));
vi.mock("@/lib/run-online-topup", () => ({ creditPaymentOrder: (...a: unknown[]) => creditPaymentOrder(...a) }));

import { handleJodoWebhook } from "@/lib/payment-webhook";
import { jodoSignature } from "@/lib/jodo";

const SECRET = "whsec_test_0123456789";
const JODO_IP = "3.6.234.242";
const REF = "11111111-1111-4111-8111-111111111111";

const order = (over: Record<string, unknown> = {}) => ({
  id: BigInt(7),
  jodoOrderId: "order_1",
  clientUuid: REF,
  userId: BigInt(1),
  branchId: BigInt(2),
  status: "pending",
  items: [{ mealTypeId: "5", qty: 1 }],
  settlementUtr: null,
  ...over,
});

const debited = (over: Record<string, unknown> = {}, orderOver: Record<string, unknown> = {}) => ({
  event_id: "evt-1",
  event: "order.payment.debited",
  payload: {
    order_id: "order_1",
    order: { status: "paid", paid_at: "2026-10-07T04:00:00Z", details: [{ amount: 60 }], notes: [{ key: "mess_ref", value: REF }], ...orderOver },
  },
  ...over,
});

function deliver(body: unknown, opts: { secret?: string; ip?: string; sig?: string | null } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers = new Headers({ "x-forwarded-for": opts.ip ?? JODO_IP });
  const sig = opts.sig === undefined ? jodoSignature(opts.secret ?? SECRET, raw) : opts.sig;
  if (sig !== null) headers.set("x-jodo-signature", sig);
  return handleJodoWebhook(raw, headers);
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.JODO_WEBHOOK_IP_ALLOWLIST;
  orderFindUnique.mockResolvedValue(order());
  configFindUnique.mockResolvedValue({ webhookSecret: SECRET });
  eventCreate.mockResolvedValue({});
  eventUpdate.mockResolvedValue({});
  creditPaymentOrder.mockResolvedValue({ ok: true, already: false });
});

describe("handleJodoWebhook — gates", () => {
  it("400s invalid JSON", async () => {
    expect(await deliver("{not json")).toMatchObject({ status: 400 });
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("200-ignores a body that isn't an order event (nothing to retry)", async () => {
    expect(await deliver({ hello: "world" })).toEqual({ status: 200, body: { ok: true, outcome: "ignored" } });
    expect(orderFindUnique).not.toHaveBeenCalled();
  });

  it("200-ignores an unknown order without storing anything", async () => {
    orderFindUnique.mockResolvedValue(null);
    expect(await deliver(debited())).toEqual({ status: 200, body: { ok: true, outcome: "unknown_order" } });
    expect(eventCreate).not.toHaveBeenCalled();
    expect(creditPaymentOrder).not.toHaveBeenCalled();
  });

  it("503s (retryable) when the branch has no webhook secret stored", async () => {
    configFindUnique.mockResolvedValue({ webhookSecret: null });
    expect(await deliver(debited())).toMatchObject({ status: 503 });
    expect(creditPaymentOrder).not.toHaveBeenCalled();
  });

  it("401s a bad or missing signature and stores nothing", async () => {
    expect(await deliver(debited(), { secret: "wrong" })).toMatchObject({ status: 401 });
    expect(await deliver(debited(), { sig: null })).toMatchObject({ status: 401 });
    expect(eventCreate).not.toHaveBeenCalled();
    expect(creditPaymentOrder).not.toHaveBeenCalled();
  });

  it("verifies the signature over the RAW body bytes", async () => {
    const raw = JSON.stringify(debited()) + "   "; // trailing whitespace changes the HMAC
    const headers = new Headers({ "x-forwarded-for": JODO_IP, "x-jodo-signature": jodoSignature(SECRET, JSON.stringify(debited())) });
    expect(await handleJodoWebhook(raw, headers)).toMatchObject({ status: 401 });
  });

  it("403s a source IP outside Jodo's allowlist, using the first X-Forwarded-For hop", async () => {
    expect(await deliver(debited(), { ip: "1.2.3.4" })).toMatchObject({ status: 403 });
    expect(await deliver(debited(), { ip: `${JODO_IP}, 10.0.0.1` })).toMatchObject({ status: 200 });
    expect(await deliver(debited(), { ip: `10.0.0.1, ${JODO_IP}` })).toMatchObject({ status: 403 });
  });

  it("honours JODO_WEBHOOK_IP_ALLOWLIST (override list, or 'any')", async () => {
    process.env.JODO_WEBHOOK_IP_ALLOWLIST = "9.9.9.9";
    expect(await deliver(debited(), { ip: JODO_IP })).toMatchObject({ status: 403 });
    expect(await deliver(debited(), { ip: "9.9.9.9" })).toMatchObject({ status: 200 });
    process.env.JODO_WEBHOOK_IP_ALLOWLIST = "any";
    expect(await deliver(debited(), { ip: "1.2.3.4" })).toMatchObject({ status: 200 });
  });

  it("200-ignores (and never credits) when the echoed notes ref doesn't match the order", async () => {
    const res = await deliver(debited({}, { notes: [{ key: "mess_ref", value: "22222222-2222-4222-8222-222222222222" }] }));
    expect(res).toEqual({ status: 200, body: { ok: true, outcome: "ignored" } });
    expect(eventCreate).not.toHaveBeenCalled();
    expect(creditPaymentOrder).not.toHaveBeenCalled();
  });

  it("accepts an order with no echoed notes (pre-notes orders)", async () => {
    expect(await deliver(debited({}, { notes: [] }))).toMatchObject({ status: 200, body: { outcome: "credited" } });
  });
});

describe("handleJodoWebhook — crediting", () => {
  it("stores the event, credits once with paid_at, and marks the event processed", async () => {
    const res = await deliver(debited());
    expect(res).toEqual({ status: 200, body: { ok: true, outcome: "credited" } });

    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventId: "evt-1", eventCode: "order.payment.debited", jodoOrderId: "order_1", paymentOrderId: BigInt(7) }),
    });
    expect(creditPaymentOrder).toHaveBeenCalledTimes(1);
    expect(creditPaymentOrder).toHaveBeenCalledWith(order(), null, { paidAt: new Date("2026-10-07T04:00:00Z") });
    expect(eventUpdate).toHaveBeenCalledWith({
      where: { eventId: "evt-1" },
      data: expect.objectContaining({ outcome: "credited", error: null }),
    });
  });

  it("reports already_credited for a late/duplicate delivery of a credited order", async () => {
    creditPaymentOrder.mockResolvedValue({ ok: true, already: true });
    expect(await deliver(debited())).toMatchObject({ status: 200, body: { outcome: "already_credited" } });
  });

  it("short-circuits a replayed event_id that was already processed", async () => {
    eventCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    eventFindUnique.mockResolvedValue({ eventId: "evt-1", processedAt: new Date() });
    expect(await deliver(debited())).toEqual({ status: 200, body: { ok: true, outcome: "duplicate" } });
    expect(creditPaymentOrder).not.toHaveBeenCalled();
  });

  it("finishes processing a replayed event whose first attempt died before completion", async () => {
    eventCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    eventFindUnique.mockResolvedValue({ eventId: "evt-1", processedAt: null });
    expect(await deliver(debited())).toMatchObject({ status: 200, body: { outcome: "credited" } });
    expect(creditPaymentOrder).toHaveBeenCalledTimes(1);
  });

  it("500s (so Jodo retries) when the order is paid but crediting fails, recording why", async () => {
    creditPaymentOrder.mockResolvedValue({ ok: false, error: "A meal has no current rate." });
    expect(await deliver(debited())).toMatchObject({ status: 500, body: { ok: false } });
    expect(eventUpdate).toHaveBeenCalledWith({
      where: { eventId: "evt-1" },
      data: expect.objectContaining({ outcome: "ignored", error: "A meal has no current rate." }),
    });
  });

  it("500s on an unexpected exception during processing", async () => {
    creditPaymentOrder.mockRejectedValue(new Error("db down"));
    expect(await deliver(debited())).toMatchObject({ status: 500 });
  });

  it("does not credit a debited event whose order status isn't paid", async () => {
    expect(await deliver(debited({}, { status: "unpaid" }))).toMatchObject({ status: 200, body: { outcome: "ignored" } });
    expect(creditPaymentOrder).not.toHaveBeenCalled();
  });

  const settled = {
    event_id: "evt-2",
    event: "order.payment.settled",
    payload: { order_id: "order_1", order: { status: "paid", details: [{ amount: 60, settlement_utr: "UTR123" }], notes: [{ key: "mess_ref", value: REF }] } },
  };

  it("records the settlement UTR from order.payment.settled on an already-credited order (no second credit)", async () => {
    creditPaymentOrder.mockResolvedValue({ ok: true, already: true });
    expect(await deliver(settled)).toEqual({ status: 200, body: { ok: true, outcome: "settled" } });
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: BigInt(7) }, data: { settlementUtr: "UTR123" } });
    expect(creditPaymentOrder).toHaveBeenCalledTimes(1); // idempotent path, returned `already`
  });

  it("credits from a settled event when the debited delivery never arrived (settlement proves payment)", async () => {
    // 2026-10-08: GP order 2822 was settled on Oct 7 but its debited event was lost — it sat uncredited.
    expect(await deliver(settled)).toEqual({ status: 200, body: { ok: true, outcome: "credited" } });
    expect(creditPaymentOrder).toHaveBeenCalledTimes(1);
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: BigInt(7) }, data: { settlementUtr: "UTR123" } });
  });

  it("does not credit from a settled event whose order is not reported paid", async () => {
    const odd = { ...settled, payload: { ...settled.payload, order: { ...settled.payload.order, status: "unpaid" } } };
    expect(await deliver(odd)).toEqual({ status: 200, body: { ok: true, outcome: "settled" } });
    expect(creditPaymentOrder).not.toHaveBeenCalled();
  });
});
