"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export type RatesState = { error?: string; success?: boolean };

const MONEY = /^\d+(\.\d{1,2})?$/;

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/**
 * Save the charge + vendor rate matrix for a branch. Updates the current
 * (open-ended) rate row per meal × category in place, or creates one valid from
 * today. Requires rates.manage AND vendorRates.manage (it writes both columns).
 */
export async function saveRatesAction(
  _prev: RatesState,
  formData: FormData,
): Promise<RatesState> {
  const actor = await requirePermission("rates.manage");
  await requirePermission("vendorRates.manage");

  const branchId = BigInt(String(formData.get("branchId") ?? "0"));
  const meals = await prisma.mealType.findMany({ where: { active: true } });
  const categories = await prisma.category.findMany({ where: { status: "active" } });

  const ops: { mealTypeId: bigint; categoryId: bigint; rate: Prisma.Decimal; vendorRate: Prisma.Decimal }[] = [];
  for (const meal of meals) {
    for (const cat of categories) {
      const rateStr = String(formData.get(`rate_${meal.id}_${cat.id}`) ?? "").trim();
      const vendorStr = String(formData.get(`vendor_${meal.id}_${cat.id}`) ?? "").trim();
      if (!rateStr && !vendorStr) continue;
      if (!rateStr || !vendorStr) {
        return { error: `Both charge and vendor are required for ${meal.name} / ${cat.name}.` };
      }
      if (!MONEY.test(rateStr) || !MONEY.test(vendorStr)) {
        return { error: `Invalid amount for ${meal.name} / ${cat.name} (max 2 decimals).` };
      }
      ops.push({
        mealTypeId: meal.id,
        categoryId: cat.id,
        rate: new Prisma.Decimal(rateStr),
        vendorRate: new Prisma.Decimal(vendorStr),
      });
    }
  }

  if (ops.length === 0) return { error: "Nothing to save." };

  const today = todayUtc();
  await prisma.$transaction(async (tx) => {
    for (const op of ops) {
      const current = await tx.mealRate.findFirst({
        where: { branchId, mealTypeId: op.mealTypeId, categoryId: op.categoryId, validTo: null },
        orderBy: { validFrom: "desc" },
      });
      if (current) {
        await tx.mealRate.update({
          where: { id: current.id },
          data: { rate: op.rate, vendorRate: op.vendorRate },
        });
      } else {
        await tx.mealRate.create({
          data: {
            branchId,
            mealTypeId: op.mealTypeId,
            categoryId: op.categoryId,
            rate: op.rate,
            vendorRate: op.vendorRate,
            validFrom: today,
          },
        });
      }
    }
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "rates.update",
        entity: "meal_rate",
        entityId: branchId,
        after: { branchId: branchId.toString(), cells: ops.length },
      },
      tx,
    );
  });

  revalidatePath("/settings/rates");
  return { success: true };
}
