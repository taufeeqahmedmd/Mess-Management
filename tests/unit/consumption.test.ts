import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  tapEngine,
  TapConflictError,
  isRetryableTapError,
  type TapParams,
} from "@/services/consumption";

/**
 * Engine unit tests over a hand-rolled in-memory transaction client. Coupon-only:
 * a tap consumes one coupon for the active meal (the wallet model was retired).
 * This covers the pure decision logic + the optimistic-lock guard without a live
 * DB; full concurrency behaviour is a DB-backed integration concern. "Tests
 * follow the money" (CLAUDE.md).
 */

const D = (n: string | number) => new Prisma.Decimal(n);

type Scenario = {
  cardStatus?: "active" | "blocked" | "lost" | "retired";
  cardMissing?: boolean;
  userStatus?: "active" | "suspended" | "inactive";
  duplicateWindow?: number;
  restrictMealSession?: boolean;
  couponCount?: number;
  existingRedemption?: boolean;
  priorRedemption?: boolean;
  rate?: string;
  forceCouponConflict?: boolean;
};

type VersionGate = { version: number; count?: { gte: number } };
type DecrementData = { count?: { decrement: number }; version: { increment: number } };

function buildTx(s: Scenario) {
  const coupon = { count: s.couponCount ?? 0, version: 0 };
  const user = {
    id: 1,
    fullName: "Asha",
    code: "EMP1",
    categoryId: 10,
    branchId: 100,
    status: s.userStatus ?? "active",
    validityExpired: false,
    cardExpiryDate: null,
    photoUrl: null,
    category: { name: "Staff" },
    couponBalances: [{ count: s.couponCount ?? 0 }],
  };
  const card = s.cardMissing ? null : { id: 2, status: s.cardStatus ?? "active", user };
  const meals = [{ id: 1, name: "Lunch", startTime: "00:00", endTime: "23:59", active: true }];
  const setting = {
    duplicateWindow: s.duplicateWindow ?? 0,
    restrictMealSession: s.restrictMealSession ?? false,
    status: "active",
  };
  const rate = { rate: D(s.rate ?? "50"), vendorRate: D("30") };
  const existing = s.existingRedemption
    ? { id: 999, paidBy: "coupon", amount: D("0"), mealTypeId: 1, mealType: { name: "Lunch" }, user }
    : null;

  let couponConflict = s.forceCouponConflict ?? false;
  const state: { created: Record<string, unknown> | null } = { created: null };

  const tx = {
    redemption: {
      findUnique: async () => existing,
      findFirst: async () => (s.priorRedemption ? { id: 888 } : null),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.created = data;
        return { id: 999, ...data };
      },
    },
    rfidCard: { findUnique: async () => card },
    user: { findUnique: async () => null },
    mealType: { findMany: async () => meals },
    // No per-counter windows in these unit scenarios → windowsForCounter falls
    // back to the global meal windows above (same as before).
    counterMeal: { findMany: async () => [] },
    categorySetting: { findFirst: async () => setting },
    mealRate: { findFirst: async () => rate },
    recharge: { findMany: async () => [], update: async () => ({}) },
    couponBalance: {
      findUnique: async () => ({ count: coupon.count, version: coupon.version }),
      updateMany: async ({ where }: { where: VersionGate; data: DecrementData }) => {
        if (couponConflict) {
          couponConflict = false;
          return { count: 0 };
        }
        if (where.version !== coupon.version || coupon.count < 1) return { count: 0 };
        coupon.count -= 1;
        coupon.version += 1;
        return { count: 1 };
      },
    },
    couponTransaction: { create: async () => ({}) },
    rechargeCoupon: { update: async () => ({}) },
  };

  return { tx: tx as unknown as Prisma.TransactionClient, state, coupon };
}

const params: TapParams = {
  cardUid: "CARD1",
  counterId: BigInt(9),
  clientUuid: "11111111-1111-4111-8111-111111111111",
  operatorId: BigInt(7),
  at: new Date("2026-06-09T06:00:00Z"),
};

describe("tapEngine", () => {
  it("replays an existing redemption without charging again (idempotent)", async () => {
    const { tx, state } = buildTx({ existingRedemption: true });
    const r = await tapEngine(tx, params);
    expect(r.status).toBe("APPROVED");
    expect(r.reason).toBe("Already recorded");
    expect(r.redemptionId).toBe("999");
    expect(state.created).toBeNull(); // nothing newly written
  });

  it("rejects an unknown card", async () => {
    const { tx } = buildTx({ cardMissing: true });
    expect((await tapEngine(tx, params)).reason).toBe("UNKNOWN CARD");
  });

  it("blocks a blocked card", async () => {
    const { tx } = buildTx({ cardStatus: "blocked" });
    const r = await tapEngine(tx, params);
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("CARD BLOCKED");
  });

  it("consumes a coupon when one is available", async () => {
    const { tx, coupon } = buildTx({ couponCount: 2 });
    const r = await tapEngine(tx, params);
    expect(r.status).toBe("APPROVED");
    expect(r.paidBy).toBe("coupon");
    expect(r.charged).toBe("0.00");
    expect(coupon.count).toBe(1);
    expect(r.cardholder?.couponsRemaining).toBe(1);
  });

  it("rejects when no coupon is available", async () => {
    const { tx } = buildTx({ couponCount: 0 });
    const r = await tapEngine(tx, params);
    expect(r.status).toBe("REJECTED");
    expect(r.reason).toBe("INSUFFICIENT COUPON");
  });

  it("blocks a repeat tap inside the duplicate window", async () => {
    const { tx } = buildTx({ duplicateWindow: 120, priorRedemption: true, couponCount: 2 });
    const r = await tapEngine(tx, params);
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("ALREADY UTILIZED");
  });

  it("blocks a second tap in a once-per-session category", async () => {
    const { tx } = buildTx({ restrictMealSession: true, priorRedemption: true, couponCount: 2 });
    const r = await tapEngine(tx, params);
    expect(r.status).toBe("BLOCKED");
    expect(r.reason).toBe("SESSION USED");
  });

  it("throws TapConflictError when the optimistic-lock guard loses a race", async () => {
    const { tx } = buildTx({ couponCount: 1, forceCouponConflict: true });
    await expect(tapEngine(tx, params)).rejects.toBeInstanceOf(TapConflictError);
  });
});

describe("isRetryableTapError", () => {
  it("retries conflicts, deadlocks, and duplicate client_uuid", () => {
    expect(isRetryableTapError(new TapConflictError())).toBe(true);
    const dup = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "x",
      meta: { target: ["client_uuid"] },
    });
    expect(isRetryableTapError(dup)).toBe(true);
    const deadlock = new Prisma.PrismaClientKnownRequestError("dl", { code: "P2034", clientVersion: "x" });
    expect(isRetryableTapError(deadlock)).toBe(true);
  });

  it("does not retry unrelated errors", () => {
    const other = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "x",
      meta: { target: ["mobile"] },
    });
    expect(isRetryableTapError(other)).toBe(false);
    expect(isRetryableTapError(new Error("boom"))).toBe(false);
  });
});
