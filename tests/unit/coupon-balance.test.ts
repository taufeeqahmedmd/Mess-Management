import { describe, it, expect, vi } from "vitest";
import { ensureCouponBalances, activeMealTypeIds } from "@/services/coupon-balance";

/**
 * Coupon-balance materialisation (`services/coupon-balance`) — the helper that
 * guarantees a cardholder holds a count-0 row per active meal. Verifies: rows
 * are created count-0 and idempotently (skipDuplicates), the empty case is a
 * no-op, and only ACTIVE meals are targeted. Money-neutral, but it seeds the
 * grid the tap engine version-locks against, so we pin the contract.
 */

describe("ensureCouponBalances", () => {
  it("creates a count-0 row per meal, idempotently (skipDuplicates)", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 3 });
    const db = { couponBalance: { createMany } } as never;

    await ensureCouponBalances(db, BigInt(42), [BigInt(7), BigInt(8), BigInt(9)]);

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { userId: BigInt(42), mealTypeId: BigInt(7) },
        { userId: BigInt(42), mealTypeId: BigInt(8) },
        { userId: BigInt(42), mealTypeId: BigInt(9) },
      ],
      skipDuplicates: true,
    });
  });

  it("is a no-op when there are no active meals (never calls createMany)", async () => {
    const createMany = vi.fn();
    const db = { couponBalance: { createMany } } as never;

    await ensureCouponBalances(db, BigInt(42), []);

    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("activeMealTypeIds", () => {
  it("returns the ids of active meals only", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: BigInt(7) }, { id: BigInt(9) }]);
    const db = { mealType: { findMany } } as never;

    const ids = await activeMealTypeIds(db);

    expect(ids).toEqual([BigInt(7), BigInt(9)]);
    expect(findMany).toHaveBeenCalledWith({ where: { active: true }, select: { id: true } });
  });
});
