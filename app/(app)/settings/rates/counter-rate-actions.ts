"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export type CounterRateState = { error?: string; success?: boolean };

const MONEY = /^\d+(\.\d{1,2})?$/;

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

type IncomingRow = {
  counterId?: string;
  mealId?: string;
  cells?: Record<string, { charge?: string; vendor?: string }>;
};

/**
 * Save the per-counter rate rows (settings/rates → "Per-counter rates"). Each row
 * is a Counter × Meal with charge + vendor per category. The submitted rows are
 * the authoritative current set: this fully replaces the branch's current
 * (open-ended) counter-specific overrides — added rows are created, edited rows
 * updated, removed rows deleted. Server re-validates every counter is in scope,
 * active, and actually serves its row's meal (never trusts the client → money).
 * Requires rates.manage AND vendorRates.manage.
 */
export async function saveCounterRatesAction(
  _prev: CounterRateState,
  formData: FormData,
): Promise<CounterRateState> {
  const actor = await requirePermission("rates.manage");
  await requirePermission("vendorRates.manage");

  const requestedBranchId = String(formData.get("branchId") ?? "0");
  if (actor.branchId && actor.branchId !== requestedBranchId) {
    return { error: "That branch is out of your scope." };
  }
  let branchId: bigint;
  try {
    branchId = BigInt(actor.branchId ?? requestedBranchId);
  } catch {
    return { error: "Invalid branch." };
  }

  let rows: IncomingRow[];
  try {
    const parsed = JSON.parse(String(formData.get("rows") ?? "[]"));
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    return { error: "Couldn't read the rate rows. Please try again." };
  }

  // Branch counters + the meals each serves (for validation).
  const counters = await prisma.counter.findMany({
    where: { branchId, status: "active", deletedAt: null },
    select: { id: true, meals: { where: { active: true }, select: { mealTypeId: true } } },
  });
  const servesMeal = new Map<string, Set<string>>();
  for (const c of counters) servesMeal.set(c.id.toString(), new Set(c.meals.map((m) => m.mealTypeId.toString())));
  const branchCounterIds = counters.map((c) => c.id);

  const categories = await prisma.category.findMany({ where: { status: "active" }, select: { id: true } });
  const catIds = new Set(categories.map((c) => c.id.toString()));

  type Op = { counterId: bigint; mealTypeId: bigint; categoryId: bigint; rate: Prisma.Decimal; vendorRate: Prisma.Decimal };
  const ops: Op[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const counterId = String(row.counterId ?? "");
    const mealId = String(row.mealId ?? "");
    if (!counterId || !mealId) continue; // incomplete row → ignore
    if (!servesMeal.has(counterId)) return { error: "A selected counter is out of scope." };
    if (!servesMeal.get(counterId)!.has(mealId)) return { error: "A selected counter doesn't serve its meal." };

    for (const [categoryId, cell] of Object.entries(row.cells ?? {})) {
      if (!catIds.has(categoryId)) continue;
      const charge = String(cell?.charge ?? "").trim();
      const vendor = String(cell?.vendor ?? "").trim();
      if (!charge && !vendor) continue; // blank cell → no rate for this category
      if (!charge || !vendor) return { error: "Each filled cell needs both a charge and a vendor amount." };
      if (!MONEY.test(charge) || !MONEY.test(vendor)) return { error: "Amounts must be numbers with at most 2 decimals." };

      const key = `${counterId}:${mealId}:${categoryId}`;
      if (seen.has(key)) return { error: "Duplicate counter + meal in the rows — merge them." };
      seen.add(key);
      ops.push({
        counterId: BigInt(counterId),
        mealTypeId: BigInt(mealId),
        categoryId: BigInt(categoryId),
        rate: new Prisma.Decimal(charge),
        vendorRate: new Prisma.Decimal(vendor),
      });
    }
  }

  const today = todayUtc();
  await prisma.$transaction(async (tx) => {
    // Replace the branch's current counter-specific overrides with the submitted set.
    if (branchCounterIds.length > 0) {
      await tx.mealRate.deleteMany({ where: { counterId: { in: branchCounterIds }, validTo: null } });
    }
    if (ops.length > 0) {
      await tx.mealRate.createMany({
        data: ops.map((o) => ({ ...o, branchId, validFrom: today })),
      });
    }
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "rates.counter",
        entity: "meal_rate",
        entityId: branchId,
        after: { branchId: branchId.toString(), overrides: ops.length },
      },
      tx,
    );
  });

  revalidatePath("/settings/rates");
  return { success: true };
}
