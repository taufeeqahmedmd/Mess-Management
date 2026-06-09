/**
 * Reporting aggregates (plan.md §7 #8–10). Pure date-range + P/L helpers plus
 * branch-scoped read-only aggregate queries over the posted ledger. Money stays
 * `Decimal` end-to-end — callers format with `.toFixed(2)` only at render.
 *
 * Sale  = Σ redemption.rateApplied  (value of the meal served — its configured
 *         rate; a coupon tap debits 0 cash at the counter, but the meal still
 *         carries its rate as revenue, prepaid earlier at recharge)
 * Cost  = Σ redemption.vendorAmount (payable to the caterer/vendor)
 * P/L   = Sale − Cost
 *
 * Branch scope: redemptions are scoped by the SERVING counter's branch
 * (`counter.branchId`); recharges by the cardholder's branch (`user.branchId`).
 * A `null` branchId actor (Super Admin / all-branch) sees everything.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

const ZERO = new Prisma.Decimal(0);

type Db = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------- date range

export type DateRange = {
  from: Date;
  to: Date;
  toExclusive: Date; // [from, toExclusive) — the day after `to` at local midnight
  fromStr: string; // YYYY-MM-DD
  toStr: string;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string to local midnight; null on empty/invalid. */
function parseDay(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

/**
 * Resolve a reporting window. Defaults to the current month (1st → today).
 * Swaps reversed inputs so `from <= to`. `now` is injected for testability.
 */
export function resolveDateRange(
  fromStr: string | undefined,
  toStr: string | undefined,
  now: Date,
): DateRange {
  const today = startOfDay(now);
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1);
  const a = parseDay(fromStr) ?? defaultFrom;
  const b = parseDay(toStr) ?? today;
  const [from, to] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
  const toExclusive = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  return { from, to, toExclusive, fromStr: fmt(from), toStr: fmt(to) };
}

/** P/L = sale − cost. Trivial but centralised so the sign is never wrong. */
export function profitLoss(sale: Prisma.Decimal, cost: Prisma.Decimal): Prisma.Decimal {
  return sale.minus(cost);
}

// ---------------------------------------------------------------- filters

export type ConsumptionFilter = {
  branchId: bigint | null;
  from: Date;
  toExclusive: Date;
  mealTypeId?: bigint;
  counterId?: bigint;
  counterIds?: bigint[]; // restrict to a set of counters (vendor dashboard)
  categoryId?: bigint;
  paidBy?: "wallet" | "coupon";
};

export function redemptionWhere(f: ConsumptionFilter): Prisma.RedemptionWhereInput {
  const where: Prisma.RedemptionWhereInput = {
    status: "posted",
    redeemedAt: { gte: f.from, lt: f.toExclusive },
  };
  if (f.branchId) where.counter = { is: { branchId: f.branchId } };
  if (f.mealTypeId) where.mealTypeId = f.mealTypeId;
  if (f.counterId) where.counterId = f.counterId;
  if (f.counterIds) where.counterId = { in: f.counterIds.length > 0 ? f.counterIds : [BigInt(-1)] };
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.paidBy) where.paidBy = f.paidBy;
  return where;
}

// ---------------------------------------------------------------- aggregates

export type ConsumptionSummary = {
  count: number;
  sale: Prisma.Decimal;
  cost: Prisma.Decimal;
  pl: Prisma.Decimal;
};

export async function consumptionSummary(db: Db, f: ConsumptionFilter): Promise<ConsumptionSummary> {
  const agg = await db.redemption.aggregate({
    where: redemptionWhere(f),
    _count: { _all: true },
    _sum: { rateApplied: true, vendorAmount: true },
  });
  // Sale = value of meals served (rateApplied), NOT cash debited at the tap.
  // Coupon taps debit 0 at the counter (prepaid at recharge), so summing `amount`
  // would book real vendor cost against ₹0 sale → a phantom loss.
  const sale = agg._sum.rateApplied ?? ZERO;
  const cost = agg._sum.vendorAmount ?? ZERO;
  return { count: agg._count._all, sale, cost, pl: profitLoss(sale, cost) };
}

export type CollectionsSummary = { count: number; amount: Prisma.Decimal };

export async function collectionsSummary(
  db: Db,
  args: { branchId: bigint | null; from: Date; toExclusive: Date },
): Promise<CollectionsSummary> {
  const agg = await db.recharge.aggregate({
    where: {
      status: "posted",
      rechargedAt: { gte: args.from, lt: args.toExclusive },
      ...(args.branchId ? { user: { is: { branchId: args.branchId } } } : {}),
    },
    _count: { _all: true },
    _sum: { amount: true },
  });
  return { count: agg._count._all, amount: agg._sum.amount ?? ZERO };
}

export type Breakdown = {
  id: string;
  label: string;
  count: number;
  sale: Prisma.Decimal;
  cost: Prisma.Decimal;
  pl: Prisma.Decimal;
};

function toBreakdown(
  id: string,
  label: string,
  count: number,
  sale: Prisma.Decimal | null,
  cost: Prisma.Decimal | null,
): Breakdown {
  const s = sale ?? ZERO;
  const c = cost ?? ZERO;
  return { id, label, count, sale: s, cost: c, pl: profitLoss(s, c) };
}

type Dimension = "mealTypeId" | "counterId" | "categoryId";

async function usageBy(db: Db, dim: Dimension, f: ConsumptionFilter): Promise<Breakdown[]> {
  const groups = await db.redemption.groupBy({
    by: [dim],
    where: redemptionWhere(f),
    _count: { _all: true },
    _sum: { rateApplied: true, vendorAmount: true },
  });

  const ids = groups.map((g) => g[dim]).filter((v): v is bigint => v != null);
  const labels = new Map<string, string>();
  if (ids.length > 0) {
    if (dim === "mealTypeId") {
      for (const m of await db.mealType.findMany({ where: { id: { in: ids } } }))
        labels.set(m.id.toString(), m.name);
    } else if (dim === "counterId") {
      for (const c of await db.counter.findMany({ where: { id: { in: ids } } }))
        labels.set(c.id.toString(), c.name);
    } else {
      for (const c of await db.category.findMany({ where: { id: { in: ids } } }))
        labels.set(c.id.toString(), c.name);
    }
  }

  return groups
    .map((g) => {
      const raw = g[dim];
      const id = raw == null ? "" : raw.toString();
      return toBreakdown(id, raw == null ? "—" : labels.get(id) ?? "—", g._count._all, g._sum.rateApplied, g._sum.vendorAmount);
    })
    .sort((a, b) => b.count - a.count);
}

export const usageByMeal = (db: Db, f: ConsumptionFilter) => usageBy(db, "mealTypeId", f);
export const usageByCounter = (db: Db, f: ConsumptionFilter) => usageBy(db, "counterId", f);
export const usageByCategory = (db: Db, f: ConsumptionFilter) => usageBy(db, "categoryId", f);

/** Active (non-deleted, non-blocked) cardholder count, branch-scoped. */
export async function activeCardholderCount(db: Db, branchId: bigint | null): Promise<number> {
  return db.user.count({
    where: { deletedAt: null, status: "active", ...(branchId ? { branchId } : {}) },
  });
}
