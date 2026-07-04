import { describe, it, expect, vi, beforeEach } from "vitest";

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
const creditPaymentOrder = vi.fn();
const getActor = vi.fn();
const can = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { paymentOrder: { findMany: (...a: unknown[]) => findMany(...a), update: (...a: unknown[]) => update(...a) } },
}));
vi.mock("@/lib/session", () => ({ getActor: (...a: unknown[]) => getActor(...a) }));
vi.mock("@/lib/rbac", () => ({ can: (...a: unknown[]) => can(...a) }));
vi.mock("@/lib/jodo", () => ({ getJodoOrder: (...a: unknown[]) => getJodoOrder(...a) }));
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

  it("leaves an order pending on a transient gateway error (never marks it failed)", async () => {
    findMany.mockResolvedValue([order()]);
    getJodoOrder.mockResolvedValue({ ok: false, error: "gateway down" });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ errored: 1, failed: 0, stillPending: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps a paid order pending when crediting fails (e.g. a lapsed rate) for a later retry", async () => {
    findMany.mockResolvedValue([order()]);
    getJodoOrder.mockResolvedValue({ ok: true, paid: true, orderStatus: "paid", amount: 60, transactionId: "TXN1", raw: {} });
    creditPaymentOrder.mockResolvedValue({ ok: false, error: "A meal has no current rate." });

    const res = await POST(cronReq());
    expect(await res.json()).toMatchObject({ credited: 0, errored: 1 });
    expect(update).not.toHaveBeenCalled(); // stays pending
  });
});
