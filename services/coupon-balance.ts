import { Prisma, type PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Coupon-balance materialisation. Every cardholder should hold one
 * `coupon_balances` row (count 0) per **active** meal — a stable, complete grid
 * for reports and a ready optimistic-lock target for the tap engine.
 *
 * These rows are behaviour-neutral: the tap engine and reports already treat a
 * missing row as zero (`?? 0`), and `applyRecharge` upserts on grant. So
 * creating count-0 rows changes no money and no tap outcome — it only removes
 * the "missing record" gap. Existing rows are never touched (counts preserved).
 */

/** Active meal-type ids — the meals a cardholder should hold a balance row for. */
export async function activeMealTypeIds(db: Db): Promise<bigint[]> {
  const meals = await db.mealType.findMany({ where: { active: true }, select: { id: true } });
  return meals.map((m) => m.id);
}

/**
 * Ensure the cardholder has a count-0 `coupon_balances` row for each given meal.
 * Idempotent via `skipDuplicates`, so it's safe to call inside the user-creation
 * transaction and safe to re-run. Pass the active meal ids (see
 * {@link activeMealTypeIds}).
 */
export async function ensureCouponBalances(db: Db, userId: bigint, mealTypeIds: bigint[]): Promise<void> {
  if (mealTypeIds.length === 0) return;
  await db.couponBalance.createMany({
    data: mealTypeIds.map((mealTypeId) => ({ userId, mealTypeId })),
    skipDuplicates: true,
  });
}
