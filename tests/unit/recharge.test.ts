import { describe, it, expect } from "vitest";
import { validateRechargeInput, reversalDeltas, couponValue } from "@/services/recharge";

describe("couponValue", () => {
  it("sums count × category rate per meal", () => {
    const r = couponValue(
      [
        { mealTypeId: "1", count: 10 },
        { mealTypeId: "2", count: 5 },
      ],
      { "1": "35.00", "2": "60.00" },
    );
    expect("value" in r && r.value.toFixed(2)).toBe("650.00");
  });

  it("ignores zero / negative counts", () => {
    const r = couponValue(
      [
        { mealTypeId: "1", count: 0 },
        { mealTypeId: "2", count: -3 },
      ],
      { "1": "35.00", "2": "60.00" },
    );
    expect("value" in r && r.value.toFixed(2)).toBe("0.00");
  });

  it("flags a granted meal that has no rate (never prices at 0)", () => {
    const r = couponValue([{ mealTypeId: "9", count: 2 }], { "1": "35.00" });
    expect(r).toEqual({ missingMeal: "9" });
  });

  it("keeps two-decimal money precision", () => {
    const r = couponValue([{ mealTypeId: "1", count: 3 }], { "1": "33.33" });
    expect("value" in r && r.value.toFixed(2)).toBe("99.99");
  });
});

describe("validateRechargeInput", () => {
  it("accepts a coupon recharge", () => {
    expect(
      validateRechargeInput({ amount: "0", coupons: [{ mealTypeId: "1", count: 5 }] }),
    ).toBeNull();
  });

  it("rejects empty (no coupons)", () => {
    expect(validateRechargeInput({ amount: "0", coupons: [] })).toMatch(/at least one coupon/i);
    expect(
      validateRechargeInput({ amount: "0", coupons: [{ mealTypeId: "1", count: 0 }] }),
    ).toMatch(/at least one coupon/i);
  });

  it("rejects malformed / negative amounts and >2 decimals", () => {
    expect(validateRechargeInput({ amount: "-5", coupons: [{ mealTypeId: "1", count: 1 }] })).toMatch(/non-negative/i);
    expect(validateRechargeInput({ amount: "1.234", coupons: [{ mealTypeId: "1", count: 1 }] })).toMatch(/2 decimals/i);
    expect(validateRechargeInput({ amount: "abc", coupons: [{ mealTypeId: "1", count: 1 }] })).toMatch(/number/i);
  });

  it("rejects non-integer / negative coupon counts", () => {
    expect(
      validateRechargeInput({ amount: "0", coupons: [{ mealTypeId: "1", count: -1 }] }),
    ).toMatch(/whole numbers/i);
    expect(
      validateRechargeInput({ amount: "0", coupons: [{ mealTypeId: "1", count: 1.5 }] }),
    ).toMatch(/whole numbers/i);
  });
});

describe("reversalDeltas (claws back only the remaining/unspent coupons)", () => {
  it("returns per-meal remaining coupons", () => {
    const d = reversalDeltas({
      coupons: [
        { mealTypeId: "1", remaining: 3 },
        { mealTypeId: "2", remaining: 0 }, // fully consumed — excluded
      ],
    });
    expect(d.couponDebits).toEqual([{ mealTypeId: "1", count: 3 }]);
  });

  it("a fully-consumed recharge reverses nothing", () => {
    const d = reversalDeltas({ coupons: [{ mealTypeId: "1", remaining: 0 }] });
    expect(d.couponDebits).toEqual([]);
  });
});
