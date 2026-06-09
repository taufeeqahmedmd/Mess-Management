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

/**
 * Set a counter-specific charge + vendor rate for a meal × category, applied to
 * one or more counters at once. Server re-validates that each counter is in the
 * actor's branch, active, and actually serves the meal — never trusts the client
 * (rates resolve at tap time → money). Requires rates.manage AND vendorRates.manage.
 */
export async function saveCounterRateAction(
  _prev: CounterRateState,
  formData: FormData,
): Promise<CounterRateState> {
  const actor = await requirePermission("rates.manage");
  await requirePermission("vendorRates.manage");

  let mealTypeId: bigint;
  let categoryId: bigint;
  try {
    mealTypeId = BigInt(String(formData.get("mealId") ?? ""));
    categoryId = BigInt(String(formData.get("categoryId") ?? ""));
  } catch {
    return { error: "Select a meal and a category." };
  }

  const charge = String(formData.get("charge") ?? "").trim();
  const vendor = String(formData.get("vendor") ?? "").trim();
  if (!MONEY.test(charge) || !MONEY.test(vendor)) {
    return { error: "Enter valid charge and vendor amounts (numbers, max 2 decimals)." };
  }

  const counterIds = formData
    .getAll("counters")
    .map((v) => {
      try {
        return BigInt(String(v));
      } catch {
        return null;
      }
    })
    .filter((v): v is bigint => v !== null);
  if (counterIds.length === 0) return { error: "Select at least one counter." };

  // Only counters in scope, active, and that serve this meal.
  const valid = await prisma.counter.findMany({
    where: {
      id: { in: counterIds },
      status: "active",
      deletedAt: null,
      ...(actor.branchId ? { branchId: BigInt(actor.branchId) } : {}),
      meals: { some: { mealTypeId, active: true } },
    },
    select: { id: true, branchId: true },
  });
  if (valid.length === 0) {
    return { error: "None of the selected counters serve this meal in your branch." };
  }

  const rateDec = new Prisma.Decimal(charge);
  const vendorDec = new Prisma.Decimal(vendor);
  const today = todayUtc();

  await prisma.$transaction(async (tx) => {
    for (const c of valid) {
      const current = await tx.mealRate.findFirst({
        where: { mealTypeId, categoryId, counterId: c.id, validTo: null },
        orderBy: { validFrom: "desc" },
      });
      if (current) {
        await tx.mealRate.update({ where: { id: current.id }, data: { rate: rateDec, vendorRate: vendorDec } });
      } else {
        await tx.mealRate.create({
          data: { branchId: c.branchId, counterId: c.id, mealTypeId, categoryId, rate: rateDec, vendorRate: vendorDec, validFrom: today },
        });
      }
    }
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "rates.counter",
        entity: "meal_rate",
        entityId: mealTypeId,
        after: {
          mealTypeId: mealTypeId.toString(),
          categoryId: categoryId.toString(),
          counters: valid.map((c) => c.id.toString()),
          rate: charge,
          vendorRate: vendor,
        },
      },
      tx,
    );
  });

  revalidatePath("/settings/rates");
  return { success: true };
}

/** Remove a counter-specific rate override (falls back to the branch default). */
export async function removeCounterRateAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("rates.manage");
  await requirePermission("vendorRates.manage");

  let id: bigint;
  try {
    id = BigInt(String(formData.get("id") ?? ""));
  } catch {
    return;
  }
  const row = await prisma.mealRate.findUnique({ where: { id } });
  if (!row || row.counterId === null) return; // only counter-specific overrides are removable here
  if (actor.branchId && row.branchId.toString() !== actor.branchId) return; // branch scope

  await prisma.$transaction(async (tx) => {
    await tx.mealRate.delete({ where: { id } });
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "rates.counter.remove",
        entity: "meal_rate",
        entityId: id,
        before: {
          counterId: row.counterId?.toString(),
          mealTypeId: row.mealTypeId.toString(),
          categoryId: row.categoryId.toString(),
          rate: row.rate.toFixed(2),
        },
      },
      tx,
    );
  });

  revalidatePath("/settings/rates");
}
