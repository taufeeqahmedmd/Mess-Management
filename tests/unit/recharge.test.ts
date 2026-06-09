import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  validateRechargeInput,
  reversalDeltas,
  nextWalletBalance,
  reconcileWallet,
  couponValue,
} from "@/services/recharge";

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
  it("accepts a wallet-only recharge", () => {
    expect(validateRechargeInput({ amount: "100.50", coupons: [] })).toBeNull();
  });

  it("accepts a coupon-only recharge", () => {
    expect(
      validateRechargeInput({ amount: "0", coupons: [{ mealTypeId: "1", count: 5 }] }),
    ).toBeNull();
  });

  it("rejects empty (no money and no coupons)", () => {
    expect(validateRechargeInput({ amount: "0", coupons: [] })).toMatch(/wallet amount/i);
    expect(
      validateRechargeInput({ amount: "0", coupons: [{ mealTypeId: "1", count: 0 }] }),
    ).toMatch(/wallet amount/i);
  });

  it("rejects malformed / negative amounts and >2 decimals", () => {
    expect(validateRechargeInput({ amount: "-5", coupons: [] })).toMatch(/non-negative/i);
    expect(validateRechargeInput({ amount: "1.234", coupons: [] })).toMatch(/2 decimals/i);
    expect(validateRechargeInput({ amount: "abc", coupons: [] })).toMatch(/number/i);
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

describe("reversalDeltas (claws back only the remaining/unspent portion)", () => {
  it("returns remaining wallet money and per-meal remaining coupons", () => {
    const d = reversalDeltas({
      remainingAmount: "40.00",
      coupons: [
        { mealTypeId: "1", remaining: 3 },
        { mealTypeId: "2", remaining: 0 }, // fully consumed — excluded
      ],
    });
    expect(d.walletDebit.toFixed(2)).toBe("40.00");
    expect(d.couponDebits).toEqual([{ mealTypeId: "1", count: 3 }]);
  });

  it("a fully-consumed recharge reverses nothing", () => {
    const d = reversalDeltas({ remainingAmount: "0", coupons: [{ mealTypeId: "1", remaining: 0 }] });
    expect(d.walletDebit.toFixed(2)).toBe("0.00");
    expect(d.couponDebits).toEqual([]);
  });
});

describe("nextWalletBalance — decimal-exact", () => {
  it("credits and debits without float drift", () => {
    expect(nextWalletBalance("0.10", "CR", "0.20").toString()).toBe("0.3"); // not 0.30000000000000004
    expect(nextWalletBalance("100.00", "DR", "30.50").toFixed(2)).toBe("69.50");
  });
});

describe("reconcileWallet — cached balance is re-derivable from the ledger", () => {
  it("sums CR minus DR", () => {
    const balance = reconcileWallet([
      { type: "CR", amount: "100.00" }, // recharge
      { type: "DR", amount: "30.50" }, // tap
      { type: "DR", amount: "40.00" }, // reversal of remaining
    ]);
    expect(balance.toFixed(2)).toBe("29.50");
  });

  it("matches a Decimal cached balance exactly", () => {
    const ledger = [
      { type: "CR" as const, amount: "12.30" },
      { type: "CR" as const, amount: "0.07" },
      { type: "DR" as const, amount: "5.00" },
    ];
    expect(reconcileWallet(ledger).equals(new Decimal("7.37"))).toBe(true);
  });
});
