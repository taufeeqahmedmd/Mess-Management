/**
 * Vendor settlement (plan.md §7 #14). A settlement is a period snapshot of what
 * the caterer is owed for a branch: meal count × vendor rate, i.e. the sum of
 * `redemption.vendorAmount` over posted redemptions served at that branch in the
 * period. Reuses the verified reporting aggregates so the number always matches
 * the Vendor Dashboard / reports for the same window.
 *
 * Settlements are computed summaries, NOT ledger rows — a draft can be recomputed
 * or deleted; once approved/paid the snapshot is frozen.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { consumptionSummary } from "./reporting";

type Db = PrismaClient | Prisma.TransactionClient;

export type SettlementTotals = { mealCount: number; grossAmount: Prisma.Decimal };

/** Parse a YYYY-MM-DD date to local midnight; null on empty/invalid. Rejects
 *  rollover (e.g. month 13, day 40) by requiring the components to round-trip. */
export function parseDay(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const d = new Date(y, mo - 1, da);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
  return d;
}

/** Display label for a settlement status. The `approved` state reads as
 *  "Invoice Raised" in the UI; the stored enum value is unchanged. */
export function settlementStatusLabel(status: string): string {
  if (status === "approved") return "Invoice Raised";
  return status.length > 0 ? status[0].toUpperCase() + status.slice(1) : status;
}

export type Period = { start: Date; end: Date; toExclusive: Date };

/**
 * Validate an inclusive [start, end] settlement period. Returns the period with
 * an exclusive upper bound (end + 1 day) for half-open range queries, or an
 * error message. Pure — testable.
 */
export function resolvePeriod(
  startStr: string | undefined,
  endStr: string | undefined,
): { ok: true; period: Period } | { ok: false; error: string } {
  const start = parseDay(startStr);
  const end = parseDay(endStr);
  if (!start || !end) return { ok: false, error: "Enter a valid start and end date." };
  if (start.getTime() > end.getTime()) return { ok: false, error: "Start date must be on or before end date." };
  const toExclusive = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  return { ok: true, period: { start, end, toExclusive } };
}

export type InvoiceTotals = { count: number; amount: Prisma.Decimal };

/**
 * All-time invoice totals for the dashboard card, branch-scoped: `pending` =
 * raised invoices awaiting payment (status `approved`), `paid` = settled ones.
 * Draft settlements are not invoices yet and are excluded.
 */
export async function invoiceStatusTotals(
  db: Db,
  branchId: bigint | null,
): Promise<{ pending: InvoiceTotals; paid: InvoiceTotals }> {
  const groups = await db.vendorSettlement.groupBy({
    by: ["status"],
    where: { status: { in: ["approved", "paid"] }, ...(branchId ? { branchId } : {}) },
    _count: { _all: true },
    _sum: { grossAmount: true },
  });
  const zero: InvoiceTotals = { count: 0, amount: new Prisma.Decimal(0) };
  const totals = { pending: zero, paid: zero };
  for (const g of groups) {
    const t = { count: g._count._all, amount: g._sum.grossAmount ?? new Prisma.Decimal(0) };
    if (g.status === "approved") totals.pending = t;
    else if (g.status === "paid") totals.paid = t;
  }
  return totals;
}

/** Meal count + gross payable for a branch over a period (Σ vendorAmount). */
export async function settlementTotals(
  db: Db,
  branchId: bigint,
  period: Period,
): Promise<SettlementTotals> {
  const sum = await consumptionSummary(db, {
    branchId,
    from: period.start,
    toExclusive: period.toExclusive,
  });
  return { mealCount: sum.count, grossAmount: sum.cost };
}
