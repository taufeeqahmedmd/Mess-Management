/**
 * Per-counter meal windows (settings/meals → "Counters & service windows").
 *
 * A counter can serve several meals, each with its own [start, end) window. This
 * resolves the meal windows that apply to taps at a given counter, ordered for
 * `activeMealNow`. When a counter has no per-counter rows it falls back to the
 * global meal windows, so existing counters keep working unchanged.
 *
 * Tap-engine integration (one line): in services/consumption.ts step 6, replace
 *
 *     const meals = await tx.mealType.findMany({ where: { active: true }, ... });
 *     const windows = meals.map((m) => ({ id: m.id.toString(), ... }));
 *
 * with
 *
 *     const windows = await windowsForCounter(tx, p.counterId);
 *
 * then `activeMealNow(windows, nowMin)` as before — the active meal is now
 * resolved for the tap's specific counter.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { MealWindow } from "./meal-window";

type Db = PrismaClient | Prisma.TransactionClient;

export async function windowsForCounter(db: Db, counterId: bigint): Promise<MealWindow[]> {
  const rows = await db.counterMeal.findMany({
    where: { counterId, active: true, mealType: { active: true } },
    include: { mealType: true },
    orderBy: { startTime: "asc" },
  });

  if (rows.length > 0) {
    return rows.map((r) => ({
      id: r.mealTypeId.toString(),
      name: r.mealType.name,
      startTime: r.startTime,
      endTime: r.endTime,
    }));
  }

  // No per-counter config → fall back to the global meal windows (current behaviour).
  const meals = await db.mealType.findMany({ where: { active: true }, orderBy: { startTime: "asc" } });
  return meals.map((m) => ({
    id: m.id.toString(),
    name: m.name,
    startTime: m.startTime,
    endTime: m.endTime,
  }));
}
