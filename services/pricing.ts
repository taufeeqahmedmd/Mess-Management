/**
 * Rate resolution (settings/rates). A meal × category rate can be specific to a
 * counter or a branch-wide default. This resolves the price for a tap, preferring
 * the counter-specific rate and falling back to the branch default — so counters
 * without an override keep using the branch rate (no behaviour change).
 *
 * Tap-engine integration (drop-in): in services/consumption.ts step 10, replace
 * the `tx.mealRate.findFirst({...})` lookup with
 *
 *     const rate = await resolveRate(tx, {
 *       branchId: user.branchId, counterId: p.counterId,
 *       mealTypeId: mealId, categoryId: user.categoryId, today,
 *     });
 *     if (!rate) return result("REJECTED", "NO RATE", meal);
 *     const price = rate.rate;
 *     const vendor = rate.vendorRate;
 *
 * `today` is the engine's branch-local date value (the same one it already passes
 * to the rate query).
 */

import { Prisma, type PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type ResolvedRate = { rate: Prisma.Decimal; vendorRate: Prisma.Decimal };

/**
 * Current branch-default charge rate per meal for a category (counter_id NULL,
 * date-current), as a mealTypeId → rate string map. Used to price coupon
 * recharges (count × rate); recharges aren't counter-specific, so only the
 * branch default applies. One row per meal (latest valid_from wins).
 */
export async function defaultRatesForCategory(
  db: Db,
  args: { branchId: bigint; categoryId: bigint; today: Date },
): Promise<Record<string, string>> {
  const rows = await db.mealRate.findMany({
    where: {
      branchId: args.branchId,
      categoryId: args.categoryId,
      counterId: null,
      validFrom: { lte: args.today },
      OR: [{ validTo: null }, { validTo: { gte: args.today } }],
    },
    orderBy: { validFrom: "desc" },
    select: { mealTypeId: true, rate: true },
  });
  const map: Record<string, string> = {};
  for (const r of rows) {
    const k = r.mealTypeId.toString();
    if (!(k in map)) map[k] = r.rate.toFixed(2); // first = latest valid_from
  }
  return map;
}

export async function resolveRate(
  db: Db,
  args: { branchId: bigint; counterId: bigint; mealTypeId: bigint; categoryId: bigint; today: Date },
): Promise<ResolvedRate | null> {
  const dated: Prisma.MealRateWhereInput = {
    mealTypeId: args.mealTypeId,
    categoryId: args.categoryId,
    validFrom: { lte: args.today },
    OR: [{ validTo: null }, { validTo: { gte: args.today } }],
  };

  // Counter-specific override first.
  const specific = await db.mealRate.findFirst({
    where: { ...dated, counterId: args.counterId },
    orderBy: { validFrom: "desc" },
  });
  if (specific) return { rate: specific.rate, vendorRate: specific.vendorRate };

  // Branch-wide default (counter_id NULL).
  const fallback = await db.mealRate.findFirst({
    where: { ...dated, branchId: args.branchId, counterId: null },
    orderBy: { validFrom: "desc" },
  });
  return fallback ? { rate: fallback.rate, vendorRate: fallback.vendorRate } : null;
}
