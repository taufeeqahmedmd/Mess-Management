import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Payment reconciliation (`app/api/payments/reconcile`) — the safety net that
 * credits online top-ups whose redirect callback never fired. Covers: cron-secret
 * vs actor auth, crediting a paid-but-uncredited order through the idempotent
 * credit path, not double-crediting (already), marking terminally-failed and
 * stale orders failed, leaving in-progress and transiently-errored orders
 * pending, and keeping a paid order pending when crediting itself fails (e.g. a
 * lapsed rate). DB / gateway / credit executor mocked at the boundary.
 * "Tests follow the money" (CLAUDE.md).
 */

const findMany = vi.fn();
const update = vi.fn();
const getJodoOrder = vi.fn();
const resolveJodoConfig = vi.fn();
const creditPaymentOrder = vi.fn();
const getActor = vi.fn();
const can = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { paymentOrder: { findMany: (...a: unknown[]) => findMany(...a), update: (...a: unknown[]) => update(...a) } },
}));
vi.mock("@/lib/session", () => ({ getActor: (...a: unknown[]) => getActor(...a) }));
vi.mock("@/lib/rbac", () => ({ can: (...a: unknown[]) => can(...a) }));
const pause = vi.fn<(ms: number) => Promise<void>>(async () => {});
// `getJodoOrder` stands in for the backoff-wrapped call (its retry loop is
// covered in jodo.test.ts); here it returns the final answer after backoff.
vi.mock("@/lib/jodo", () => ({
  getJodoOrderWithBackoff: (...a: unknown[]) => getJodoOrder(...a),
  pause: (ms: number) => pause(ms),
  resolveJodoConfig: (...a: unknown[]) => resolveJodoConfig(...a),
}));
vi.mock("@/lib/run-online-topup", () => ({ creditPaymentOrder: (...a: unknown[]) => creditPaymentOrder(...a) }));

import { POST } from "@/app/api/payments/reconcile/route";

const SECRET = "cron-secret-abc";
const req = (headers: Record<string, string> = {}) => new Request("http://x/api/payments/reconcile", { method: "POST", headers });
const cronReq = () => req({ "x-cron-secret": SECRET });

const order = (over: Record<string, unknown> = {}) => ({
  id: BigInt(1),
  jodoOrderId: "JODO-1",
  clientUuid: "11111111-1111-4111-8111-111111111111",
  userId: BigInt(1),
  branchId: BigInt(1),
  status: "pending",
  items: [{ mealTypeId: "5", qty: 1 }],
  createdAt: new Date(Date.now() - 60 * 60_000), // 1h old: past MIN_AGE, not yet stale
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  can.mockReturnValue(true);
  findMany.mockResolvedValue([]);
  resolveJodoConfig.mockResolvedValue({ base: "https://ext.jodo.in", auth: "dXNlcjpwYXNz", collectorCode: "NACHARAM" });
  creditPaymentOrder.mockResolvedValue({ ok: true, already: false });
});

describe("POST /api/payments/reconcile — auth", () => {
  it("401s when there's no cron secret and no session", async () => {
    getActor.mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("403s a logged-in actor without recharge.create", async () => {
    getActor.mockResolvedValue({ id: "9" });
    can.mockReturnValue(false);
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("accepts the cron secret without a session", async () => {
    const res = await POST(cronReq());
    expect(res.status).toBe(200);
    expect(getActor).not.toHaveBeenCalled();
  });
});

describe("POST /api/payments/reconcile — settlement", () => {
  it("credits a paid-but-uncredited order via the idempotent credit path", async () => {
    findMany.mockResolvedValue([order()]);
    getJodoOrder.mockResolvedValue({ ok: true, paid: true, orderStatus: "paid", amount: 60, transactionId: "TXN9", raw: {} });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ checked: 1, credited: 1, alreadyCredited: 0, failed: 0, errored: 0 });
    expect(creditPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({ id: BigInt(1) }), "TXN9");
    expect(update).not.toHaveBeenCalled();
  });

  it("counts an already-credited order (race with a late callback) without double-posting", async () => {
    findMany.mockResolvedValue([order()]);
    getJodoOrder.mockResolvedValue({ ok: true, paid: true, orderStatus: "paid", amount: 60, transactionId: null, raw: {} });
    creditPaymentOrder.mockResolvedValue({ ok: true, already: true });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ credited: 0, alreadyCredited: 1 });
  });

  it("marks a gateway-terminal (failed/expired) order failed", async () => {
    findMany.mockResolvedValue([order()]);
    getJodoOrder.mockResolvedValue({ ok: true, paid: false, orderStatus: "expired", amount: null, transactionId: null, raw: {} });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ failed: 1, stillPending: 0 });
    expect(update).toHaveBeenCalledWith({ where: { id: BigInt(1) }, data: { status: "failed" } });
    expect(creditPaymentOrder).not.toHaveBeenCalled();
  });

  it("marks a stale still-unpaid order failed so it isn't re-checked forever", async () => {
    findMany.mockResolvedValue([order({ createdAt: new Date(Date.now() - 48 * 60 * 60_000) })]); // 48h old
    getJodoOrder.mockResolvedValue({ ok: true, paid: false, orderStatus: "pending", amount: null, transactionId: null, raw: {} });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ failed: 1 });
    expect(update).toHaveBeenCalledWith({ where: { id: BigInt(1) }, data: { status: "failed" } });
  });

  it("leaves a recent, still-in-progress order pending", async () => {
    findMany.mockResolvedValue([order()]); // 1h old, not stale
    getJodoOrder.mockResolvedValue({ ok: true, paid: false, orderStatus: "created", amount: null, transactionId: null, raw: {} });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ stillPending: 1, failed: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  it("leaves an order pending (errored) when its branch has no gateway config", async () => {
    findMany.mockResolvedValue([order()]);
    resolveJodoConfig.mockResolvedValue(null);

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({
      errored: 1,
      failed: 0,
      stillPending: 0,
      credited: 0,
      errors: [{ id: "1", reason: "branch 1 has no complete payment config" }],
    });
    expect(getJodoOrder).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("leaves an order pending on a transient gateway error (never marks it failed)", async () => {
    findMany.mockResolvedValue([order()]);
    getJodoOrder.mockResolvedValue({ ok: false, error: "gateway down" });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({
      errored: 1,
      failed: 0,
      stillPending: 0,
      errors: [{ id: "1", reason: "get-order unreachable: gateway down" }],
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("reports the gateway's HTTP status and message for a rejected get-order", async () => {
    findMany.mockResolvedValue([order()]);
    getJodoOrder.mockResolvedValue({ ok: false, status: 404, error: "Order not found" });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({
      errored: 1,
      errors: [{ id: "1", reason: "get-order 404: Order not found" }],
    });
  });

  it("reports an unexpected exception as an errored order and keeps going", async () => {
    findMany.mockResolvedValue([order(), order({ id: BigInt(2), jodoOrderId: "JODO-2" })]);
    getJodoOrder
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: true, paid: true, orderStatus: "paid", amount: 60, transactionId: "TXN2", raw: {} });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({
      checked: 2,
      credited: 1,
      errored: 1,
      errors: [{ id: "1", reason: "exception: boom" }],
    });
  });

  it("keeps a paid order pending when crediting fails (e.g. a lapsed rate) for a later retry", async () => {
    findMany.mockResolvedValue([order()]);
    getJodoOrder.mockResolvedValue({ ok: true, paid: true, orderStatus: "paid", amount: 60, transactionId: "TXN1", raw: {} });
    creditPaymentOrder.mockResolvedValue({ ok: false, error: "A meal has no current rate." });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({
      credited: 0,
      errored: 1,
      errors: [{ id: "1", reason: "paid but credit failed: A meal has no current rate." }],
    });
    expect(update).not.toHaveBeenCalled(); // stays pending
  });
});

describe("POST /api/payments/reconcile — gateway rate limit (429)", () => {
  const unpaid = { ok: true, paid: false, orderStatus: "unpaid", amount: 60, transactionId: null, raw: {} };
  const limited = { ok: false, status: 429, error: "Too many requests." };
  const orders = (n: number) => Array.from({ length: n }, (_, i) => order({ id: BigInt(i + 1), jodoOrderId: `JODO-${i + 1}` }));

  afterEach(() => vi.restoreAllMocks());

  it("paces gateway calls with a pause between each and passes the backoff schedule", async () => {
    findMany.mockResolvedValue(orders(3));
    getJodoOrder.mockResolvedValue(unpaid);

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ checked: 3, stillPending: 3, deferred: 0, rateLimited: false });
    expect(pause.mock.calls.map((c) => c[0])).toEqual([1000, 1000]); // between calls, not before the first
    expect(getJodoOrder).toHaveBeenCalledWith(expect.anything(), "JODO-1", [2000, 5000]);
  });

  it("stops the run when Jodo is still rate-limiting after backoff, deferring the rest", async () => {
    findMany.mockResolvedValue(orders(4));
    getJodoOrder.mockResolvedValueOnce(unpaid).mockResolvedValueOnce(limited).mockResolvedValue(unpaid);

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({
      checked: 1,
      stillPending: 1,
      errored: 0,
      deferred: 3, // the 429'd order and the two after it
      rateLimited: true,
      errors: [],
    });
    expect(getJodoOrder).toHaveBeenCalledTimes(2); // never hammers the remaining orders
    expect(update).not.toHaveBeenCalled(); // a 429 never marks anything failed
  });

  it("defers what's left once the run's time budget is spent", async () => {
    findMany.mockResolvedValue(orders(3));
    getJodoOrder.mockResolvedValue(unpaid);
    const t0 = Date.now();
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(t0) // run start
      .mockReturnValueOnce(t0) // budget check, order 1
      .mockReturnValue(t0 + 41_000); // later checks: budget (40s) exceeded

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ checked: 1, stillPending: 1, deferred: 2, rateLimited: false });
    expect(getJodoOrder).toHaveBeenCalledTimes(1);
  });
});
