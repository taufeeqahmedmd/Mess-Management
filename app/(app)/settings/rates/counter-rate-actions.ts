"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export type RatesEditorState = { error?: string; success?: boolean };

const MONEY = /^\d+(\.\d{1,2})?$/;

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

type IncomingRow = {
  counterIds?: string[];
  mealId?: string;
  cells?: Record<string, { charge?: string; vendor?: string }>;
};

/**
 * Save the rates editor rows (settings/rates — one table). Each row is a meal
 * priced across categories, for either the branch default (no counter selected →
 * counter_id NULL) or one/more specific counters. The submitted rows are the
 * authoritative current set: this fully replaces the branch's current
 * (open-ended) rates — defaults and counter-specific alike. Server re-validates
 * branch scope, meals, categories, and amounts; never trusts the client (rates
 * resolve at tap time → money). Requires rates.manage AND vendorRates.manage.
 */
export async function saveRatesAction(
  _prev: RatesEditorState,
  formData: FormData,
): Promise<RatesEditorState> {
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

  const [branchCounters, activeMeals, activeCategories] = await Promise.all([
    prisma.counter.findMany({ where: { branchId, status: "active", deletedAt: null }, select: { id: true } }),
    prisma.mealType.findMany({ where: { active: true }, select: { id: true } }),
    prisma.category.findMany({ where: { status: "active" }, select: { id: true } }),
  ]);
  const counterIdSet = new Set(branchCounters.map((c) => c.id.toString()));
  const mealIdSet = new Set(activeMeals.map((m) => m.id.toString()));
  const catIdSet = new Set(activeCategories.map((c) => c.id.toString()));

  type Op = { counterId: bigint | null; mealTypeId: bigint; categoryId: bigint; rate: Prisma.Decimal; vendorRate: Prisma.Decimal };
  const ops: Op[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const mealId = String(row.mealId ?? "");
    if (!mealId) continue; // incomplete row → ignore
    if (!mealIdSet.has(mealId)) return { error: "A selected meal is invalid." };

    const counterIds = Array.isArray(row.counterIds) ? row.counterIds.map(String).filter(Boolean) : [];
    for (const cid of counterIds) {
      if (!counterIdSet.has(cid)) return { error: "A selected counter is out of scope." };
    }
    const targets: (bigint | null)[] = counterIds.length ? counterIds.map((c) => BigInt(c)) : [null];

    for (const [categoryId, cell] of Object.entries(row.cells ?? {})) {
      if (!catIdSet.has(categoryId)) continue;
      const charge = String(cell?.charge ?? "").trim();
      const vendor = String(cell?.vendor ?? "").trim();
      if (!charge && !vendor) continue;
      if (!charge || !vendor) return { error: "Each filled cell needs both a charge and a vendor amount." };
      if (!MONEY.test(charge) || !MONEY.test(vendor)) return { error: "Amounts must be numbers with at most 2 decimals." };

      const rate = new Prisma.Decimal(charge);
      const vendorRate = new Prisma.Decimal(vendor);
      for (const target of targets) {
        const key = `${target === null ? "default" : target.toString()}:${mealId}:${categoryId}`;
        if (seen.has(key)) {
          return { error: "The same counter + meal + category appears twice — merge those rows." };
        }
        seen.add(key);
        ops.push({ counterId: target, mealTypeId: BigInt(mealId), categoryId: BigInt(categoryId), rate, vendorRate });
      }
    }
  }

  const today = todayUtc();
  await prisma.$transaction(async (tx) => {
    // Replace the branch's current rates (defaults + counter-specific) with the rows.
    await tx.mealRate.deleteMany({ where: { branchId, validTo: null } });
    if (ops.length > 0) {
      await tx.mealRate.createMany({ data: ops.map((o) => ({ ...o, branchId, validFrom: today })) });
    }
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "rates.save",
        entity: "meal_rate",
        entityId: branchId,
        after: { branchId: branchId.toString(), rates: ops.length },
      },
      tx,
    );
  });

  revalidatePath("/settings/rates");
  return { success: true };
}
