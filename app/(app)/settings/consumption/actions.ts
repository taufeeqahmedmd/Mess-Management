"use server";

import { revalidatePath } from "next/cache";
import type { ConsumptionModel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export type ConsumptionState = { error?: string; success?: boolean };

/**
 * Save per-category consumption settings. Each active category has ONE active
 * CategorySetting (plan.md §6); this updates that row (or creates it active if
 * missing). The partial unique index keeps one active per category.
 */
export async function saveConsumptionAction(
  _prev: ConsumptionState,
  formData: FormData,
): Promise<ConsumptionState> {
  const actor = await requirePermission("categories.manage");
  const categories = await prisma.category.findMany({ where: { status: "active" } });

  const ops: {
    categoryId: bigint;
    model: ConsumptionModel;
    duplicateWindow: number;
    restrictMealSession: boolean;
  }[] = [];

  for (const cat of categories) {
    const model: ConsumptionModel =
      String(formData.get(`model_${cat.id}`)) === "coupon" ? "coupon" : "wallet";
    const dupStr = String(formData.get(`dup_${cat.id}`) ?? "0").trim();
    if (!/^\d+$/.test(dupStr)) {
      return { error: `Duplicate window for ${cat.name} must be a whole number of seconds.` };
    }
    ops.push({
      categoryId: cat.id,
      model,
      duplicateWindow: parseInt(dupStr, 10),
      restrictMealSession: formData.get(`restrict_${cat.id}`) === "on",
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const op of ops) {
      const active = await tx.categorySetting.findFirst({
        where: { categoryId: op.categoryId, status: "active" },
      });
      if (active) {
        await tx.categorySetting.update({
          where: { id: active.id },
          data: {
            model: op.model,
            duplicateWindow: op.duplicateWindow,
            restrictMealSession: op.restrictMealSession,
          },
        });
      } else {
        await tx.categorySetting.create({
          data: {
            categoryId: op.categoryId,
            model: op.model,
            duplicateWindow: op.duplicateWindow,
            restrictMealSession: op.restrictMealSession,
            status: "active",
          },
        });
      }
    }
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "consumption.update",
        entity: "category_setting",
        after: { categories: ops.length },
      },
      tx,
    );
  });

  revalidatePath("/settings/consumption");
  return { success: true };
}
