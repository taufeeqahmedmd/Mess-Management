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

import { Prisma, type PrismaClient, type RechargeStatus } from "@prisma/client";
import { mealColorAt } from "@/lib/meal-colors";

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
  paidBy?: "coupon";
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

/** Recharge-list filters — shared by the Reports → Recharges tab and its CSV export. */
export type RechargeFilter = {
  branchId: bigint | null;
  q?: string;
  from?: Date; // both set = date range applied; both unset = all time
  toExclusive?: Date;
  status?: RechargeStatus;
  paymentModeId?: bigint;
  source?: "online" | "manual";
  operator?: "self" | bigint; // "self" = online/self-service (no operator)
};

export function rechargeWhere(f: RechargeFilter): Prisma.RechargeWhereInput {
  const where: Prisma.RechargeWhereInput = {};
  if (f.branchId) where.user = { branchId: f.branchId };
  if (f.from && f.toExclusive) where.rechargedAt = { gte: f.from, lt: f.toExclusive };
  if (f.status) where.status = f.status;
  if (f.paymentModeId) where.paymentModeId = f.paymentModeId;
  if (f.source === "online") where.transactionId = { not: null };
  if (f.source === "manual") where.transactionId = null;
  if (f.operator === "self") where.appUserId = null;
  else if (f.operator) where.appUserId = f.operator;
  if (f.q) {
    where.OR = [
      { user: { is: { fullName: { contains: f.q, mode: "insensitive" } } } },
      { user: { is: { code: { contains: f.q, mode: "insensitive" } } } },
      { user: { is: { phone: { contains: f.q } } } },
      { transactionId: { contains: f.q, mode: "insensitive" } },
      { remarks: { contains: f.q, mode: "insensitive" } },
    ];
  }
  return where;
}

/** Parse the Recharges tab's raw searchParams into a RechargeFilter (branch scope applied by the caller). */
export function parseRechargeFilter(
  sp: { q?: string; from?: string; to?: string; mode?: string; status?: string; source?: string; operator?: string },
  branchId: bigint | null,
): RechargeFilter {
  const hasRange = Boolean(sp.from || sp.to);
  const range = resolveDateRange(sp.from, sp.to, new Date());
  return {
    branchId,
    q: (sp.q ?? "").trim() || undefined,
    from: hasRange ? range.from : undefined,
    toExclusive: hasRange ? range.toExclusive : undefined,
    status: ["posted", "reversed", "expired"].includes(sp.status ?? "") ? (sp.status as RechargeStatus) : undefined,
    paymentModeId: /^\d+$/.test(sp.mode ?? "") ? BigInt(sp.mode as string) : undefined,
    source: sp.source === "online" || sp.source === "manual" ? sp.source : undefined,
    operator: sp.operator === "self" ? "self" : /^\d+$/.test(sp.operator ?? "") ? BigInt(sp.operator as string) : undefined,
  };
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

/** All-time collections (Σ recharge.amount), branch-scoped, NO date filter. */
export async function overallCollections(db: Db, branchId: bigint | null): Promise<Prisma.Decimal> {
  const agg = await db.recharge.aggregate({
    where: { status: "posted", ...(branchId ? { user: { is: { branchId } } } : {}) },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? ZERO;
}

/** All-time vendor payable (Σ redemption.vendorAmount), branch-scoped, NO date filter. */
export async function overallVendorCost(db: Db, branchId: bigint | null): Promise<Prisma.Decimal> {
  const agg = await db.redemption.aggregate({
    where: { status: "posted", ...(branchId ? { counter: { is: { branchId } } } : {}) },
    _sum: { vendorAmount: true },
  });
  return agg._sum.vendorAmount ?? ZERO;
}

export type TrendPoint = { date: string; label: string; profit: number };

/**
 * Profit-over-time series for the chart, bucketed across the filter window:
 * daily for ranges up to ~2 months, monthly beyond. Buckets are contiguous (gaps
 * filled with 0) so the chart has an even X axis. Profit per bucket =
 * Σ rateApplied − Σ vendorAmount (same definition as the Profit card). The
 * numeric `profit` is for chart geometry only — money math stays in Decimal.
 */
export async function profitTrend(db: Db, f: ConsumptionFilter): Promise<TrendPoint[]> {
  const rows = await db.redemption.findMany({
    where: redemptionWhere(f),
    select: { redeemedAt: true, rateApplied: true, vendorAmount: true },
  });

  const spanDays = Math.max(1, Math.round((f.toExclusive.getTime() - f.from.getTime()) / 86_400_000));
  const monthly = spanDays > 62;
  const keyOf = (d: Date) =>
    monthly ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : fmt(d);
  const labelOf = (d: Date) =>
    monthly ? d.toLocaleDateString("en-IN", { month: "short" }) : String(d.getDate());

  const buckets = new Map<string, { label: string; sale: Prisma.Decimal; cost: Prisma.Decimal }>();
  const cursor = monthly ? new Date(f.from.getFullYear(), f.from.getMonth(), 1) : startOfDay(f.from);
  while (cursor < f.toExclusive) {
    buckets.set(keyOf(cursor), { label: labelOf(cursor), sale: ZERO, cost: ZERO });
    if (monthly) cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }

  for (const r of rows) {
    const b = buckets.get(keyOf(r.redeemedAt));
    if (!b) continue;
    b.sale = b.sale.plus(r.rateApplied);
    b.cost = b.cost.plus(r.vendorAmount);
  }

  return [...buckets.entries()].map(([date, b]) => ({
    date,
    label: b.label,
    profit: Number(b.sale.minus(b.cost).toFixed(2)),
  }));
}

export type SaleVendorPoint = { date: string; label: string; sale: number; vendor: number };

/**
 * Sale vs vendor-payable per bucket (daily ≤~2 months, else monthly) across the
 * filter window — drives the consumption report's grouped bar chart. Same
 * bucketing as profitTrend; numbers are for chart geometry only.
 */
export async function salesVendorTrend(db: Db, f: ConsumptionFilter): Promise<SaleVendorPoint[]> {
  const rows = await db.redemption.findMany({
    where: redemptionWhere(f),
    select: { redeemedAt: true, rateApplied: true, vendorAmount: true },
  });

  const spanDays = Math.max(1, Math.round((f.toExclusive.getTime() - f.from.getTime()) / 86_400_000));
  const monthly = spanDays > 62;
  const keyOf = (d: Date) => (monthly ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : fmt(d));
  const labelOf = (d: Date) => (monthly ? d.toLocaleDateString("en-IN", { month: "short" }) : String(d.getDate()));

  const buckets = new Map<string, { label: string; sale: Prisma.Decimal; cost: Prisma.Decimal }>();
  const cursor = monthly ? new Date(f.from.getFullYear(), f.from.getMonth(), 1) : startOfDay(f.from);
  while (cursor < f.toExclusive) {
    buckets.set(keyOf(cursor), { label: labelOf(cursor), sale: ZERO, cost: ZERO });
    if (monthly) cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  for (const r of rows) {
    const b = buckets.get(keyOf(r.redeemedAt));
    if (!b) continue;
    b.sale = b.sale.plus(r.rateApplied);
    b.cost = b.cost.plus(r.vendorAmount);
  }
  return [...buckets.entries()].map(([date, b]) => ({
    date,
    label: b.label,
    sale: Number(b.sale.toFixed(2)),
    vendor: Number(b.cost.toFixed(2)),
  }));
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

export type DayMealCell = { count: number; cost: Prisma.Decimal };

export type DayUsageRow = {
  date: string; // YYYY-MM-DD (local day of the tap)
  count: number;
  cost: Prisma.Decimal;
  byMeal: Record<string, DayMealCell>; // keyed by mealTypeId ("" = no meal recorded)
};

export type DayUsage = {
  meals: { id: string; label: string }[]; // meals present in the window, creation order
  days: DayUsageRow[]; // ascending by date; days without activity are omitted
};

/** Bucket posted redemptions into per-day totals with a per-meal split. Pure — testable. */
export function bucketRedemptionsByDay(
  rows: { redeemedAt: Date; vendorAmount: Prisma.Decimal; mealTypeId: bigint | null }[],
): { days: DayUsageRow[]; mealIds: string[] } {
  const byDay = new Map<string, DayUsageRow>();
  const mealIds = new Set<string>();
  for (const r of rows) {
    const date = fmt(r.redeemedAt);
    let day = byDay.get(date);
    if (!day) {
      day = { date, count: 0, cost: ZERO, byMeal: {} };
      byDay.set(date, day);
    }
    day.count += 1;
    day.cost = day.cost.plus(r.vendorAmount);
    const mid = r.mealTypeId?.toString() ?? "";
    mealIds.add(mid);
    const cell = day.byMeal[mid] ?? { count: 0, cost: ZERO };
    cell.count += 1;
    cell.cost = cell.cost.plus(r.vendorAmount);
    day.byMeal[mid] = cell;
  }
  return {
    days: [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    mealIds: [...mealIds],
  };
}

/**
 * Day-wise vendor payable across the filter window, each day split by meal —
 * drives the settlement detail's day-wise table so a payable can be verified
 * against the vendor's own daily service register.
 */
export async function usageByDay(db: Db, f: ConsumptionFilter): Promise<DayUsage> {
  const rows = await db.redemption.findMany({
    where: redemptionWhere(f),
    select: { redeemedAt: true, vendorAmount: true, mealTypeId: true },
  });
  const { days, mealIds } = bucketRedemptionsByDay(rows);

  const numericIds = mealIds.filter((id) => id !== "").map((id) => BigInt(id));
  const meals: { id: string; label: string }[] = [];
  if (numericIds.length > 0) {
    for (const m of await db.mealType.findMany({ where: { id: { in: numericIds } }, orderBy: { id: "asc" }, select: { id: true, name: true } }))
      meals.push({ id: m.id.toString(), label: m.name });
  }
  if (mealIds.includes("")) meals.push({ id: "", label: "—" });
  return { meals, days };
}

export const usageByMeal = (db: Db, f: ConsumptionFilter) => usageBy(db, "mealTypeId", f);
export const usageByCounter = (db: Db, f: ConsumptionFilter) => usageBy(db, "counterId", f);
export const usageByCategory = (db: Db, f: ConsumptionFilter) => usageBy(db, "categoryId", f);

/**
 * Usage summarised by cardholder-type **Identifier** (`category.identifierLabel`)
 * rather than category name: categories that share an identifier label are folded
 * into one summed row. Drives the dashboard's "Usage by category" cut.
 */
export async function usageByCardholderType(db: Db, f: ConsumptionFilter): Promise<Breakdown[]> {
  const groups = await db.redemption.groupBy({
    by: ["categoryId"],
    where: redemptionWhere(f),
    _count: { _all: true },
    _sum: { rateApplied: true, vendorAmount: true },
  });

  const ids = groups.map((g) => g.categoryId).filter((v): v is bigint => v != null);
  const labelByCat = new Map<string, string>();
  if (ids.length > 0) {
    for (const c of await db.category.findMany({ where: { id: { in: ids } }, select: { id: true, identifierLabel: true } }))
      labelByCat.set(c.id.toString(), c.identifierLabel);
  }

  // Fold categories sharing an identifier label into a single summed row.
  const byLabel = new Map<string, { count: number; sale: Prisma.Decimal; cost: Prisma.Decimal }>();
  for (const g of groups) {
    const label = g.categoryId != null ? labelByCat.get(g.categoryId.toString()) ?? "—" : "—";
    const cur = byLabel.get(label) ?? { count: 0, sale: ZERO, cost: ZERO };
    cur.count += g._count._all;
    cur.sale = cur.sale.plus(g._sum.rateApplied ?? ZERO);
    cur.cost = cur.cost.plus(g._sum.vendorAmount ?? ZERO);
    byLabel.set(label, cur);
  }

  return [...byLabel.entries()]
    .map(([label, v]) => toBreakdown(label, label, v.count, v.sale, v.cost))
    .sort((a, b) => b.count - a.count);
}

/**
 * Stable meal-id → colour map (creation order). Use everywhere meals are
 * coloured so a meal's colour is consistent platform-wide; new meals auto-take
 * the next palette colour. See lib/meal-colors.
 */
export async function mealColorMap(db: Db): Promise<Record<string, string>> {
  const meals = await db.mealType.findMany({ orderBy: { id: "asc" }, select: { id: true } });
  const map: Record<string, string> = {};
  meals.forEach((m, i) => {
    map[m.id.toString()] = mealColorAt(i);
  });
  return map;
}

/** Active (non-deleted, non-blocked) cardholder count, branch-scoped. */
export async function activeCardholderCount(db: Db, branchId: bigint | null): Promise<number> {
  return db.user.count({
    where: { deletedAt: null, status: "active", ...(branchId ? { branchId } : {}) },
  });
}

export type CategorySlice = { id: string; label: string; value: number };

/** Active cardholders grouped by category (donut on the balance report). */
export async function cardholdersByCategory(db: Db, branchId: bigint | null): Promise<CategorySlice[]> {
  const groups = await db.user.groupBy({
    by: ["categoryId"],
    where: { deletedAt: null, status: "active", ...(branchId ? { branchId } : {}) },
    _count: { _all: true },
  });
  const ids = groups.map((g) => g.categoryId).filter((v): v is bigint => v != null);
  const names = new Map<string, string>();
  if (ids.length > 0)
    for (const c of await db.category.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }))
      names.set(c.id.toString(), c.name);
  return groups
    .map((g) => ({
      id: g.categoryId?.toString() ?? "",
      label: g.categoryId != null ? names.get(g.categoryId.toString()) ?? "—" : "—",
      value: g._count._all,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Coupon liability = Σ (unredeemed coupon count × the current branch vendor rate
 * for that meal × the cardholder's category). The vendor would owe this if every
 * outstanding coupon were redeemed. Resolves the current branch-level rate
 * (`counterId IS NULL`, valid today, latest `validFrom`) per meal:category:branch.
 */
export async function couponLiability(db: Db, branchId: bigint | null): Promise<Prisma.Decimal> {
  const balances = await db.couponBalance.findMany({
    where: { count: { gt: 0 }, ...(branchId ? { user: { is: { branchId } } } : {}) },
    select: { count: true, mealTypeId: true, user: { select: { categoryId: true, branchId: true } } },
  });
  if (balances.length === 0) return ZERO;

  const today = startOfDay(new Date());
  const rates = await db.mealRate.findMany({
    where: {
      counterId: null,
      ...(branchId ? { branchId } : {}),
      validFrom: { lte: today },
      OR: [{ validTo: null }, { validTo: { gte: today } }],
    },
    select: { mealTypeId: true, categoryId: true, branchId: true, vendorRate: true },
    orderBy: { validFrom: "desc" },
  });
  const rateByKey = new Map<string, Prisma.Decimal>();
  for (const r of rates) {
    const key = `${r.mealTypeId}:${r.categoryId}:${r.branchId}`;
    if (!rateByKey.has(key)) rateByKey.set(key, r.vendorRate); // first seen = latest validFrom
  }

  let sum = ZERO;
  for (const b of balances) {
    const cat = b.user.categoryId;
    const br = b.user.branchId;
    if (cat == null || br == null) continue;
    const rate = rateByKey.get(`${b.mealTypeId}:${cat}:${br}`);
    if (rate) sum = sum.plus(rate.mul(b.count));
  }
  return sum;
}
