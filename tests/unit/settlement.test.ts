import { describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { resolvePeriod, parseDay, invoiceStatusTotals, overlappingSettlement } from "@/services/settlement";

describe("parseDay", () => {
  it("parses YYYY-MM-DD to local midnight", () => {
    const d = parseDay("2026-06-15");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(5);
    expect(d?.getDate()).toBe(15);
    expect(d?.getHours()).toBe(0);
  });
  it("rejects junk", () => {
    expect(parseDay("")).toBeNull();
    expect(parseDay("nope")).toBeNull();
    expect(parseDay("2026-13-40")).toBeNull();
  });
});

describe("resolvePeriod", () => {
  it("accepts a valid inclusive period and exposes an exclusive upper bound", () => {
    const r = resolvePeriod("2026-06-01", "2026-06-30");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.period.start.getDate()).toBe(1);
      expect(r.period.end.getDate()).toBe(30);
      // exclusive bound is the day after `end` → July 1
      expect(r.period.toExclusive.getMonth()).toBe(6);
      expect(r.period.toExclusive.getDate()).toBe(1);
    }
  });

  it("allows a single-day period", () => {
    const r = resolvePeriod("2026-06-09", "2026-06-09");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.period.toExclusive.getDate()).toBe(10);
  });

  it("rejects a reversed period", () => {
    const r = resolvePeriod("2026-06-30", "2026-06-01");
    expect(r.ok).toBe(false);
  });

  it("rejects missing/invalid dates", () => {
    expect(resolvePeriod(undefined, "2026-06-01").ok).toBe(false);
    expect(resolvePeriod("2026-06-01", "bad").ok).toBe(false);
  });
});

describe("invoiceStatusTotals", () => {
  const dbWith = (groups: unknown[]) =>
    ({ vendorSettlement: { groupBy: async () => groups } }) as unknown as PrismaClient;

  it("splits grouped rows into pending (approved) and paid totals", async () => {
    const t = await invoiceStatusTotals(
      dbWith([
        { status: "approved", _count: { _all: 2 }, _sum: { grossAmount: new Prisma.Decimal("116736.00") } },
        { status: "paid", _count: { _all: 1 }, _sum: { grossAmount: new Prisma.Decimal("58128.00") } },
      ]),
      null,
    );
    expect(t.pending.count).toBe(2);
    expect(t.pending.amount.toFixed(2)).toBe("116736.00");
    expect(t.paid.count).toBe(1);
    expect(t.paid.amount.toFixed(2)).toBe("58128.00");
  });

  it("returns zero totals when no invoices exist", async () => {
    const t = await invoiceStatusTotals(dbWith([]), null);
    expect(t.pending.count).toBe(0);
    expect(t.pending.amount.isZero()).toBe(true);
    expect(t.paid.count).toBe(0);
    expect(t.paid.amount.isZero()).toBe(true);
  });
});

describe("overlappingSettlement", () => {
  const period = (resolvePeriod("2026-07-01", "2026-07-31") as { ok: true; period: import("@/services/settlement").Period }).period;

  function dbCapturing(result: unknown) {
    const calls: unknown[] = [];
    const db = {
      vendorSettlement: {
        findFirst: async (args: unknown) => {
          calls.push(args);
          return result;
        },
      },
    } as unknown as PrismaClient;
    return { db, calls };
  }

  it("queries an inclusive overlap for the vendor + branch and returns the clash", async () => {
    const row = { id: BigInt(7), periodStart: new Date(2026, 6, 15), periodEnd: new Date(2026, 7, 14), status: "approved" };
    const { db, calls } = dbCapturing(row);
    const clash = await overlappingSettlement(db, BigInt(1), BigInt(2), period);
    expect(clash).toBe(row);
    const where = (calls[0] as { where: Record<string, unknown> }).where;
    expect(where.vendorId).toBe(BigInt(1));
    expect(where.branchId).toBe(BigInt(2));
    // existing.start <= new.end AND existing.end >= new.start → touching periods clash too
    expect(where.periodStart).toEqual({ lte: period.end });
    expect(where.periodEnd).toEqual({ gte: period.start });
  });

  it("returns null when no settlement overlaps", async () => {
    const { db } = dbCapturing(null);
    expect(await overlappingSettlement(db, BigInt(1), BigInt(2), period)).toBeNull();
  });
});
