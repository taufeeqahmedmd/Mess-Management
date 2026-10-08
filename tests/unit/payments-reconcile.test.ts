import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Payment reconciliation (`app/api/payments/reconcile`) — the SAFETY NET behind
 * Jodo's webhooks. Covers: cron-secret vs actor auth; only due orders are
 * examined; self-healing from a stored paid webhook event (no gateway call);
 * crediting a paid order via the idempotent credit path; never double-crediting;
 * per-order exponential backoff for unpaid / errored / rate-limited orders
 * (a 429 never marks anything failed); terminal and stale (>3d) orders marked
 * failed; pacing; the run time budget; and the webhook-health counters.
 * DB / gateway / credit executor mocked at the boundary. "Tests follow the money".
 */

const findMany = vi.fn();
const update = vi.fn();
const count = vi.fn();
const findFirst = vi.fn();
const eventFindMany = vi.fn();
const eventCount = vi.fn();
const getJodoOrder = vi.fn();
const resolveJodoConfig = vi.fn();
const creditPaymentOrder = vi.fn();
const getActor = vi.fn();
const can = vi.fn();
const pause = vi.fn<(ms: number) => Promise<void>>(async () => {});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentOrder: {
      findMany: (...a: unknown[]) => findMany(...a),
      update: (...a: unknown[]) => update(...a),
      count: (...a: unknown[]) => count(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
    },
    paymentWebhookEvent: { findMany: (...a: unknown[]) => eventFindMany(...a), count: (...a: unknown[]) => eventCount(...a) },
  },
}));
vi.mock("@/lib/session", () => ({ getActor: (...a: unknown[]) => getActor(...a) }));
vi.mock("@/lib/rbac", () => ({ can: (...a: unknown[]) => can(...a) }));
vi.mock("@/lib/jodo", () => ({
  getJodoOrder: (...a: unknown[]) => getJodoOrder(...a),
  pause: (ms: number) => pause(ms),
  resolveJodoConfig: (...a: unknown[]) => resolveJodoConfig(...a),
}));
vi.mock("@/lib/run-online-topup", () => ({ creditPaymentOrder: (...a: unknown[]) => creditPaymentOrder(...a) }));
const raisePaymentAlert = vi.fn();
vi.mock("@/lib/payment-alerts", () => ({ raisePaymentAlert: (...a: unknown[]) => raisePaymentAlert(...a) }));

import { POST } from "@/app/api/payments/reconcile/route";

const SECRET = "cron-secret-abc";
const req = (headers: Record<string, string> = {}) => new Request("http://x/api/payments/reconcile", { method: "POST", headers });
const cronReq = () => req({ "x-cron-secret": SECRET });

const HOUR = 60 * 60_000;
const order = (over: Record<string, unknown> = {}) => ({
  id: BigInt(1),
  jodoOrderId: "JODO-1",
  clientUuid: "11111111-1111-4111-8111-111111111111",
  userId: BigInt(1),
  branchId: BigInt(1),
  status: "pending",
  items: [{ mealTypeId: "5", qty: 1 }],
  createdAt: new Date(Date.now() - HOUR),
  nextCheckAt: new Date(Date.now() - 60_000),
  checkCount: 0,
  ...over,
});
const unpaid = { ok: true, paid: false, orderStatus: "unpaid", amount: 60, transactionId: null, raw: {} };
const paid = { ok: true, paid: true, orderStatus: "paid", amount: 60, transactionId: "TXN1", raw: {} };
const limited = { ok: false, status: 429, error: "Too many requests." };

/** The `data` of the update() call for order `id`. */
const updateDataFor = (id: bigint) =>
  (update.mock.calls.find((c) => (c[0] as { where: { id: bigint } }).where.id === id)?.[0] as { data: Record<string, unknown> } | undefined)?.data;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  can.mockReturnValue(true);
  findMany.mockResolvedValue([]);
  eventFindMany.mockResolvedValue([]);
  update.mockResolvedValue({});
  count.mockResolvedValue(0);
  eventCount.mockResolvedValue(0);
  findFirst.mockResolvedValue(null);
  raisePaymentAlert.mockResolvedValue(true);
  resolveJodoConfig.mockResolvedValue({ base: "https://ext.jodo.in", auth: "dXNlcjpwYXNz", collectorCode: "NACHARAM" });
  creditPaymentOrder.mockResolvedValue({ ok: true, already: false });
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/payments/reconcile — auth", () => {
  it("401s when there's no cron secret and no session", async () => {
    getActor.mockResolvedValue(null);
    expect((await POST(req())).status).toBe(401);
  });
  it("403s a logged-in actor without recharge.create", async () => {
    getActor.mockResolvedValue({ id: "1" });
    can.mockReturnValue(false);
    expect((await POST(req())).status).toBe(403);
  });
  it("accepts the cron secret without a session, and a wrong secret falls back to session auth", async () => {
    expect((await POST(cronReq())).status).toBe(200);
    getActor.mockResolvedValue(null);
    expect((await POST(req({ "x-cron-secret": "nope" }))).status).toBe(401);
  });
});

describe("POST /api/payments/reconcile — selection", () => {
  it("examines only pending orders whose next check is due (or unscheduled), oldest first", async () => {
    await POST(cronReq());
    const args = findMany.mock.calls[0][0] as { where: Record<string, unknown>; orderBy: unknown; take: number };
    expect(args.where).toMatchObject({ status: "pending" });
    expect(args.where.OR).toEqual([{ nextCheckAt: null }, { nextCheckAt: { lte: expect.any(Date) } }]);
    expect(args.orderBy).toEqual([{ nextCheckAt: "asc" }, { createdAt: "asc" }]);
    expect(args.take).toBe(60);
  });
});

describe("POST /api/payments/reconcile — settlement", () => {
  it("self-heals from a stored paid webhook event without calling the gateway", async () => {
    findMany.mockResolvedValue([order()]);
    eventFindMany.mockResolvedValue([
      {
        payload: {
          event_id: "evt-1",
          event: "order.payment.debited",
          payload: { order_id: "JODO-1", order: { status: "paid", paid_at: "2026-10-07T04:00:00Z", details: [{ amount: 60 }] } },
        },
      },
    ]);

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ checked: 1, credited: 1, healed: 1, errored: 0 });
    expect(creditPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({ id: BigInt(1) }), null, { paidAt: new Date("2026-10-07T04:00:00Z") });
    expect(getJodoOrder).not.toHaveBeenCalled();
  });

  it("credits a paid-but-uncredited order via the idempotent credit path", async () => {
    findMany.mockResolvedValue([order()]);
    getJodoOrder.mockResolvedValue(paid);

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ checked: 1, credited: 1, alreadyCredited: 0, failed: 0, errored: 0 });
    expect(creditPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({ id: BigInt(1) }), "TXN1");
    expect(update).not.toHaveBeenCalled(); // credit path owns the order update
  });

  it("counts an already-credited order (race with a late webhook) without double-posting", async () => {
    findMany.mockResolvedValue([order()]);
    getJodoOrder.mockResolvedValue(paid);
    creditPaymentOrder.mockResolvedValue({ ok: true, already: true });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ credited: 0, alreadyCredited: 1 });
    expect(creditPaymentOrder).toHaveBeenCalledTimes(1);
  });

  it("reschedules a still-unpaid order with exponential backoff", async () => {
    findMany.mockResolvedValue([order({ checkCount: 1 })]);
    getJodoOrder.mockResolvedValue(unpaid);

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ stillPending: 1, failed: 0 });
    const data = updateDataFor(BigInt(1))!;
    expect(data.checkCount).toEqual({ increment: 1 });
    expect((data.nextCheckAt as Date).getTime()).toBeGreaterThan(Date.now() + 59 * 60_000); // checkCount 1 → +1h
  });

  it("marks a gateway-terminal (failed/expired) order failed and stops scheduling it", async () => {
    findMany.mockResolvedValue([order()]);
    getJodoOrder.mockResolvedValue({ ...unpaid, orderStatus: "expired" });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ failed: 1, stillPending: 0 });
    expect(updateDataFor(BigInt(1))).toEqual({ status: "failed", nextCheckAt: null });
  });

  it("marks a still-unpaid order older than 3 days failed (Jodo's webhook retry horizon)", async () => {
    findMany.mockResolvedValue([order({ createdAt: new Date(Date.now() - 73 * HOUR) })]);
    getJodoOrder.mockResolvedValue(unpaid);

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ failed: 1 });
    expect(updateDataFor(BigInt(1))).toEqual({ status: "failed", nextCheckAt: null });
  });

  it("marks an order Jodo no longer knows ('Order not found') failed once it is past the first-poll window", async () => {
    const notFound = { ok: false, status: 400, error: "Order not found for id: JODO-1" };
    findMany.mockResolvedValue([
      order({ createdAt: new Date(Date.now() - 2 * HOUR) }), // aged out → abandoned checkout
      order({ id: BigInt(2), jodoOrderId: "JODO-2", createdAt: new Date(Date.now() - 10 * 60_000) }), // fresh → could be a glitch
      order({ id: BigInt(3), jodoOrderId: "JODO-3", createdAt: new Date(Date.now() - 2 * HOUR) }),
    ]);
    getJodoOrder
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce({ ...notFound, error: "Order not found for id: JODO-2" })
      .mockResolvedValueOnce({ ok: false, status: 404, error: "Resource not found" });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ checked: 3, failed: 2, errored: 1, errors: [{ id: "2", reason: "get-order 400: Order not found for id: JODO-2" }] });
    expect(updateDataFor(BigInt(1))).toEqual({ status: "failed", nextCheckAt: null });
    expect(updateDataFor(BigInt(2))).toMatchObject({ checkCount: { increment: 1 } });
    expect(updateDataFor(BigInt(3))).toEqual({ status: "failed", nextCheckAt: null });
    expect(creditPaymentOrder).not.toHaveBeenCalled();
  });

  it("reschedules (never fails) an order on a 429 or transient gateway error, with the reason", async () => {
    findMany.mockResolvedValue([order(), order({ id: BigInt(2), jodoOrderId: "JODO-2", createdAt: new Date(Date.now() - 80 * HOUR) })]);
    getJodoOrder.mockResolvedValueOnce(limited).mockResolvedValueOnce({ ok: false, error: "gateway down" });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({
      checked: 2,
      errored: 2,
      failed: 0,
      errors: [
        { id: "1", reason: "get-order 429: Too many requests." },
        { id: "2", reason: "get-order unreachable: gateway down" },
      ],
    });
    expect(updateDataFor(BigInt(1))).toMatchObject({ checkCount: { increment: 1 } });
    expect(updateDataFor(BigInt(2))).toMatchObject({ checkCount: { increment: 1 } }); // stale but unknown → still pending
  });

  it("keeps a paid order pending (rescheduled) when crediting fails, e.g. a lapsed rate", async () => {
    findMany.mockResolvedValue([order()]);
    getJodoOrder.mockResolvedValue(paid);
    creditPaymentOrder.mockResolvedValue({ ok: false, error: "A meal has no current rate." });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ credited: 0, errored: 1, errors: [{ id: "1", reason: "paid but credit failed: A meal has no current rate." }] });
    expect(updateDataFor(BigInt(1))).toMatchObject({ checkCount: { increment: 1 } });
  });

  it("reschedules an order whose branch has no gateway config", async () => {
    findMany.mockResolvedValue([order()]);
    resolveJodoConfig.mockResolvedValue(null);

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ errored: 1, errors: [{ id: "1", reason: "branch 1 has no complete payment config" }] });
    expect(getJodoOrder).not.toHaveBeenCalled();
  });

  it("paces gateway calls (pause between calls, not before the first)", async () => {
    findMany.mockResolvedValue([order(), order({ id: BigInt(2) }), order({ id: BigInt(3) })]);
    getJodoOrder.mockResolvedValue(unpaid);

    await POST(cronReq());
    expect(pause.mock.calls.map((c) => c[0])).toEqual([500, 500]);
  });

  it("defers what's left once the run's time budget is spent", async () => {
    findMany.mockResolvedValue([order(), order({ id: BigInt(2) }), order({ id: BigInt(3) })]);
    getJodoOrder.mockResolvedValue(unpaid);
    const t0 = Date.now();
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(t0) // run start
      .mockReturnValueOnce(t0) // budget check, order 1
      .mockReturnValue(t0 + 41_000); // later checks: budget (40s) exceeded

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ checked: 1, deferred: 2 });
    expect(getJodoOrder).toHaveBeenCalledTimes(1);
  });

  it("reports webhook health so a dead subscription is visible in the cron log", async () => {
    eventCount.mockResolvedValue(12);
    count.mockResolvedValueOnce(10).mockResolvedValueOnce(3); // ordersLast24h, pendingPastFirstCheck
    findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 2 * HOUR) });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({
      health: { ordersLast24h: 10, webhookEventsLast24h: 12, pendingPastFirstCheck: 3, oldestPendingAgeMin: 120, creditedBySafetyNet: 0, stuckOrders: 0 },
      alert: null,
    });
    expect(raisePaymentAlert).not.toHaveBeenCalled();
  });

  it("raises a staff alert when a paid order had to be credited by polling (webhook missed)", async () => {
    findMany.mockResolvedValue([order()]);
    getJodoOrder.mockResolvedValue(paid);
    eventCount.mockResolvedValue(5);
    count.mockResolvedValueOnce(6).mockResolvedValueOnce(0);

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ credited: 1, healed: 0, alert: { key: "webhook_missed", sent: true } });
    expect(raisePaymentAlert).toHaveBeenCalledWith(expect.objectContaining({ key: "webhook_missed" }), expect.objectContaining({ creditedBySafetyNet: 1 }));
  });

  it("does not count a self-healed credit as a missed webhook", async () => {
    findMany.mockResolvedValue([order()]);
    eventFindMany.mockResolvedValue([{ payload: { event_id: "e", event: "order.payment.debited", payload: { order_id: "JODO-1", order: { status: "paid" } } } }]);
    eventCount.mockResolvedValue(5);
    count.mockResolvedValueOnce(6).mockResolvedValueOnce(0);

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ credited: 1, healed: 1, alert: null });
  });

  it("counts an order as stuck only after several failed polls", async () => {
    findMany.mockResolvedValue([order({ checkCount: 3 }), order({ id: BigInt(2), jodoOrderId: "JODO-2", checkCount: 1 })]);
    getJodoOrder.mockResolvedValue(limited);
    eventCount.mockResolvedValue(5);
    count.mockResolvedValueOnce(6).mockResolvedValueOnce(2);

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ errored: 2, health: { stuckOrders: 1 }, alert: { key: "orders_stuck" } });
  });
});
