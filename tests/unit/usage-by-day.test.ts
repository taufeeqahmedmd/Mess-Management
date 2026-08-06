import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { bucketRedemptionsByDay } from "@/services/reporting";

const D = (s: string) => new Prisma.Decimal(s);

function tap(iso: string, vendorAmount: string, mealTypeId: bigint | null = BigInt(1)) {
  return { redeemedAt: new Date(iso), vendorAmount: D(vendorAmount), mealTypeId };
}

describe("bucketRedemptionsByDay", () => {
  it("returns no days for no redemptions", () => {
    const { days, mealIds } = bucketRedemptionsByDay([]);
    expect(days).toEqual([]);
    expect(mealIds).toEqual([]);
  });

  it("groups taps by local day and sums vendor amounts in Decimal", () => {
    const { days } = bucketRedemptionsByDay([
      tap("2026-06-01T08:15:00", "48.00"),
      tap("2026-06-01T13:05:00", "48.00"),
      tap("2026-06-02T13:10:00", "48.00"),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(days[0].count).toBe(2);
    expect(days[0].cost.toFixed(2)).toBe("96.00");
    expect(days[1].count).toBe(1);
    expect(days[1].cost.toFixed(2)).toBe("48.00");
  });

  it("sorts days ascending regardless of input order", () => {
    const { days } = bucketRedemptionsByDay([
      tap("2026-06-03T13:00:00", "10.00"),
      tap("2026-06-01T13:00:00", "10.00"),
      tap("2026-06-02T13:00:00", "10.00"),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
  });

  it("splits each day by meal and reconciles per-meal cells to the day total", () => {
    const { days, mealIds } = bucketRedemptionsByDay([
      tap("2026-06-01T08:00:00", "20.00", BigInt(1)),
      tap("2026-06-01T13:00:00", "48.00", BigInt(2)),
      tap("2026-06-01T13:01:00", "48.00", BigInt(2)),
    ]);
    const day = days[0];
    expect(mealIds.sort()).toEqual(["1", "2"]);
    expect(day.byMeal["1"].count).toBe(1);
    expect(day.byMeal["1"].cost.toFixed(2)).toBe("20.00");
    expect(day.byMeal["2"].count).toBe(2);
    expect(day.byMeal["2"].cost.toFixed(2)).toBe("96.00");
    expect(day.count).toBe(3);
    expect(day.cost.toFixed(2)).toBe("116.00");
  });

  it("buckets a null mealTypeId under the empty-string key", () => {
    const { days, mealIds } = bucketRedemptionsByDay([tap("2026-06-01T13:00:00", "48.00", null)]);
    expect(mealIds).toEqual([""]);
    expect(days[0].byMeal[""].count).toBe(1);
  });
});
