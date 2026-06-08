import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { resolveDateRange, profitLoss, redemptionWhere } from "@/services/reporting";

const D = (s: string) => new Prisma.Decimal(s);

describe("resolveDateRange", () => {
  it("defaults to the current month (1st → today)", () => {
    const now = new Date(2026, 5, 9); // 2026-06-09 local
    const r = resolveDateRange(undefined, undefined, now);
    expect(r.fromStr).toBe("2026-06-01");
    expect(r.toStr).toBe("2026-06-09");
    // exclusive upper bound is the day after `to`
    expect(r.toExclusive.getFullYear()).toBe(2026);
    expect(r.toExclusive.getMonth()).toBe(5);
    expect(r.toExclusive.getDate()).toBe(10);
  });

  it("parses explicit YYYY-MM-DD bounds", () => {
    const r = resolveDateRange("2026-01-15", "2026-02-20", new Date(2026, 5, 9));
    expect(r.fromStr).toBe("2026-01-15");
    expect(r.toStr).toBe("2026-02-20");
    expect(r.toExclusive.getDate()).toBe(21);
  });

  it("swaps reversed bounds so from <= to", () => {
    const r = resolveDateRange("2026-03-10", "2026-03-01", new Date(2026, 5, 9));
    expect(r.fromStr).toBe("2026-03-01");
    expect(r.toStr).toBe("2026-03-10");
  });

  it("ignores malformed input and falls back to defaults", () => {
    const now = new Date(2026, 5, 9);
    const r = resolveDateRange("not-a-date", "13/13/2026", now);
    expect(r.fromStr).toBe("2026-06-01");
    expect(r.toStr).toBe("2026-06-09");
  });

  it("crosses a month/year boundary cleanly", () => {
    const r = resolveDateRange("2025-12-31", "2025-12-31", new Date(2026, 5, 9));
    expect(r.toExclusive.getFullYear()).toBe(2026);
    expect(r.toExclusive.getMonth()).toBe(0);
    expect(r.toExclusive.getDate()).toBe(1);
  });
});

describe("profitLoss", () => {
  it("is sale − cost", () => {
    expect(profitLoss(D("100.00"), D("70.00")).toFixed(2)).toBe("30.00");
  });
  it("goes negative when cost exceeds sale (coupon meals have 0 sale)", () => {
    expect(profitLoss(D("0.00"), D("45.00")).toFixed(2)).toBe("-45.00");
  });
  it("keeps two-decimal money precision", () => {
    expect(profitLoss(D("33.33"), D("11.11")).toFixed(2)).toBe("22.22");
  });
});

describe("redemptionWhere", () => {
  const base = { branchId: null, from: new Date(2026, 5, 1), toExclusive: new Date(2026, 5, 10) };

  it("always scopes to posted redemptions in the window", () => {
    const w = redemptionWhere(base);
    expect(w.status).toBe("posted");
    expect(w.redeemedAt).toEqual({ gte: base.from, lt: base.toExclusive });
    expect(w.counter).toBeUndefined();
  });

  it("adds a branch filter via the serving counter when scoped", () => {
    const w = redemptionWhere({ ...base, branchId: BigInt(7) });
    expect(w.counter).toEqual({ is: { branchId: BigInt(7) } });
  });

  it("restricts to a counter set, and never matches when the set is empty", () => {
    expect(redemptionWhere({ ...base, counterIds: [BigInt(1), BigInt(2)] }).counterId).toEqual({
      in: [BigInt(1), BigInt(2)],
    });
    expect(redemptionWhere({ ...base, counterIds: [] }).counterId).toEqual({ in: [BigInt(-1)] });
  });

  it("passes through meal / category / paidBy filters", () => {
    const w = redemptionWhere({ ...base, mealTypeId: BigInt(3), categoryId: BigInt(4), paidBy: "coupon" });
    expect(w.mealTypeId).toBe(BigInt(3));
    expect(w.categoryId).toBe(BigInt(4));
    expect(w.paidBy).toBe("coupon");
  });
});
