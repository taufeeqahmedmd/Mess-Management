import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * Online top-up crediting (`lib/run-online-topup`) — the money-critical path that
 * turns a confirmed-paid Jodo order into coupons. Covers: idempotent replay (order
 * status + P2002 race), Decimal amount recomputed from the catalog (never trusted
 * from the order), garbage items rejected, missing rate rejected. The DB and the
 * recharge executor are mocked at the module boundary; the pricing math
 * (couponValue) runs for real. "Tests follow the money" (CLAUDE.md).
 */

const applyRecharge = vi.fn();
const writeAudit = vi.fn();
const defaultRatesForCategory = vi.fn();
const userFindUnique = vi.fn();
const paymentOrderUpdate = vi.fn();

// The tx client handed to the $transaction callback — only what the credit path touches.
const txMock = {
  paymentMode: { upsert: vi.fn(async () => ({ id: BigInt(3) })) },
  paymentOrder: { update: paymentOrderUpdate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock),
  },
}));
vi.mock("@/lib/audit", () => ({ writeAudit: (...a: unknown[]) => writeAudit(...a) }));
vi.mock("@/services/recharge-ledger", () => ({ applyRecharge: (...a: unknown[]) => applyRecharge(...a) }));
vi.mock("@/services/pricing", () => ({ defaultRatesForCategory: (...a: unknown[]) => defaultRatesForCategory(...a) }));

import { creditPaymentOrder } from "@/lib/run-online-topup";

const order = (over: Partial<Parameters<typeof creditPaymentOrder>[0]> = {}) => ({
  id: BigInt(11),
  clientUuid: "11111111-1111-4111-8111-111111111111",
  userId: BigInt(1),
  branchId: BigInt(100),
  status: "pending",
  items: [
    { mealTypeId: "5", qty: 2 },
    { mealTypeId: "6", qty: 1 },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockResolvedValue({ categoryId: BigInt(10), branchId: BigInt(100) });
  defaultRatesForCategory.mockResolvedValue({ "5": "60.00", "6": "35.00" });
  applyRecharge.mockResolvedValue({ id: BigInt(77) });
});

describe("creditPaymentOrder", () => {
  it("credits coupons with the Decimal amount recomputed from the catalog", async () => {
    const r = await creditPaymentOrder(order(), "TXN123");
    expect(r).toEqual({ ok: true, already: false });

    expect(applyRecharge).toHaveBeenCalledTimes(1);
    const p = applyRecharge.mock.calls[0][1] as {
      amount: Prisma.Decimal;
      coupons: { mealTypeId: bigint; count: number }[];
      appUserId: bigint | null;
      clientUuid: string;
      transactionId: string | null;
    };
    // 2 × 60.00 + 1 × 35.00 — computed via couponValue (Decimal), not the order.
    expect(p.amount.toFixed(2)).toBe("155.00");
    expect(p.coupons).toEqual([
      { mealTypeId: BigInt(5), count: 2 },
      { mealTypeId: BigInt(6), count: 1 },
    ]);
    expect(p.appUserId).toBeNull(); // self-service — no operator
    expect(p.clientUuid).toBe("11111111-1111-4111-8111-111111111111"); // idempotency key
    expect(p.transactionId).toBe("TXN123");

    // Order marked credited + linked to the recharge, and audited, in the same tx.
    expect(paymentOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "credited", rechargeId: BigInt(77) }) }),
    );
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  it("short-circuits an already-credited order (idempotent replay)", async () => {
    const r = await creditPaymentOrder(order({ status: "credited" }), "TXN123");
    expect(r).toEqual({ ok: true, already: true });
    expect(applyRecharge).not.toHaveBeenCalled();
    expect(paymentOrderUpdate).not.toHaveBeenCalled();
  });

  it("treats a P2002 race (concurrent callback) as already credited, never double-posts", async () => {
    applyRecharge.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x", meta: { target: ["client_uuid"] } }),
    );
    const r = await creditPaymentOrder(order(), null);
    expect(r).toEqual({ ok: true, already: true });
  });

  it("rethrows non-P2002 transaction failures (order stays uncredited)", async () => {
    applyRecharge.mockRejectedValueOnce(new Error("db down"));
    await expect(creditPaymentOrder(order(), null)).rejects.toThrow("db down");
  });

  it("rejects when a stored meal has no current rate — never prices at 0", async () => {
    defaultRatesForCategory.mockResolvedValue({ "5": "60.00" }); // meal 6 unpriced
    const r = await creditPaymentOrder(order(), null);
    expect(r).toEqual({ ok: false, error: "A meal has no current rate." });
    expect(applyRecharge).not.toHaveBeenCalled();
  });

  it("rejects empty or garbage item payloads", async () => {
    expect(await creditPaymentOrder(order({ items: [] }), null)).toEqual({ ok: false, error: "Nothing to credit." });
    expect(await creditPaymentOrder(order({ items: "junk" }), null)).toEqual({ ok: false, error: "Nothing to credit." });
    expect(
      await creditPaymentOrder(order({ items: [{ mealTypeId: "5", qty: 0 }, { mealTypeId: "", qty: 2 }] }), null),
    ).toEqual({ ok: false, error: "Nothing to credit." });
    expect(applyRecharge).not.toHaveBeenCalled();
  });

  it("rejects when the cardholder no longer exists", async () => {
    userFindUnique.mockResolvedValue(null);
    const r = await creditPaymentOrder(order(), null);
    expect(r).toEqual({ ok: false, error: "Cardholder not found." });
  });
});
