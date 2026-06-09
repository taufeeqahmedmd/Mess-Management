import { describe, expect, it } from "vitest";
import { isMoney, moneyString, rateRowsSchema } from "@/services/rates";

describe("rates — shared validation schema", () => {
  describe("isMoney / moneyString", () => {
    it("accepts non-negative amounts with up to 2 decimals", () => {
      for (const v of ["0", "5", "12.5", "100.00", "0.99", "  40 "]) {
        expect(isMoney(v)).toBe(true);
      }
    });

    it("rejects negatives, >2 decimals, and non-numeric input", () => {
      for (const v of ["-1", "1.234", "1.2.3", "abc", "", "1e3", "₹40"]) {
        expect(isMoney(v)).toBe(false);
      }
    });

    it("trims surrounding whitespace before validating", () => {
      expect(moneyString.safeParse("  12.00  ").success).toBe(true);
    });
  });

  describe("rateRowsSchema", () => {
    it("parses a well-formed rows payload", () => {
      const payload = [
        { counterIds: ["1", "2"], mealId: "3", cells: { "4": { charge: "40", vendor: "30" } } },
        { mealId: "5", cells: {} }, // branch-default row, no counters
      ];
      const parsed = rateRowsSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it("rejects a non-array payload", () => {
      expect(rateRowsSchema.safeParse({ mealId: "3" }).success).toBe(false);
    });

    it("rejects rows whose counterIds are not strings", () => {
      expect(rateRowsSchema.safeParse([{ counterIds: [1, 2], mealId: "3" }]).success).toBe(false);
    });
  });
});
