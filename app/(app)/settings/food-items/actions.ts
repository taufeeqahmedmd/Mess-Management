"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export type FoodItemFormState = { error?: string };

const money = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount (e.g. 15 or 15.50).");

const foodItemSchema = z.object({
  code: z.string().trim().min(1, "Code is required.").max(30),
  name: z.string().trim().min(1, "Name is required.").max(120),
  kind: z.enum(["beverage", "snack", "meal", "custom"]),
  unitPrice: money,
  unitVendorPrice: money,
  mealTypeId: z.string().regex(/^\d+$/, "Pick a meal type."),
  active: z.boolean(),
});

function parse(formData: FormData) {
  return {
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    kind: String(formData.get("kind") ?? ""),
    unitPrice: String(formData.get("unitPrice") ?? "").trim(),
    unitVendorPrice: String(formData.get("unitVendorPrice") ?? "").trim(),
    mealTypeId: String(formData.get("mealTypeId") ?? "").trim(),
    active: formData.get("active") === "on",
  };
}

/**
 * Resolve the food item's branch. A scoped admin is forced to their own branch
 * (they can't create for anyone else). An all-branch actor (Super Admin) picks:
 * a real branch, or blank = "all branches" (null = offered everywhere).
 */
async function resolveBranchId(
  actorBranchId: string | null,
  formData: FormData,
): Promise<{ branchId: bigint | null } | { error: string }> {
  if (actorBranchId) return { branchId: BigInt(actorBranchId) };
  const raw = String(formData.get("branchId") ?? "").trim();
  if (!raw) return { branchId: null };
  let bid: bigint;
  try {
    bid = BigInt(raw);
  } catch {
    return { error: "Invalid branch." };
  }
  const b = await prisma.branch.findUnique({ where: { id: bid }, select: { id: true } });
  if (!b) return { error: "Invalid branch." };
  return { branchId: b.id };
}

export async function createFoodItemAction(
  _prev: FoodItemFormState,
  formData: FormData,
): Promise<FoodItemFormState> {
  const actor = await requirePermission("foodItems.manage");
  const parsed = foodItemSchema.safeParse(parse(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  const rb = await resolveBranchId(actor.branchId, formData);
  if ("error" in rb) return rb;

  const data = {
    code: d.code,
    name: d.name,
    kind: d.kind,
    unitPrice: new Prisma.Decimal(d.unitPrice),
    unitVendorPrice: new Prisma.Decimal(d.unitVendorPrice),
    mealTypeId: BigInt(d.mealTypeId),
    branchId: rb.branchId, // scoped admin → own branch; super admin → picked branch or all-branch
    active: d.active,
  };

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.foodItem.create({ data });
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "foodItem.create", entity: "food_item", entityId: created.id, after: { code: d.code, unitPrice: d.unitPrice } },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return { error: "A food item with that code already exists." };
      if (e.code === "P2003") return { error: "Pick a valid meal type." };
    }
    throw e;
  }

  revalidatePath("/settings/food-items");
  redirect("/settings/food-items?flash=created");
}

export async function updateFoodItemAction(
  _prev: FoodItemFormState,
  formData: FormData,
): Promise<FoodItemFormState> {
  const actor = await requirePermission("foodItems.manage");
  let id: bigint;
  try {
    id = BigInt(String(formData.get("id") ?? ""));
  } catch {
    return { error: "Invalid item." };
  }
  const parsed = foodItemSchema.safeParse(parse(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  const before = await prisma.foodItem.findUnique({ where: { id } });
  if (!before) return { error: "Food item not found." };
  if (actor.branchId && before.branchId && before.branchId.toString() !== actor.branchId) {
    return { error: "Out of your branch scope." };
  }

  // Only an all-branch actor (Super Admin) reassigns the branch; a scoped admin
  // leaves it as-is (so they can't move an item to/from another branch).
  let branchId: bigint | null | undefined;
  if (!actor.branchId) {
    const rb = await resolveBranchId(actor.branchId, formData);
    if ("error" in rb) return rb;
    branchId = rb.branchId;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.foodItem.update({
        where: { id },
        data: {
          code: d.code,
          name: d.name,
          kind: d.kind,
          unitPrice: new Prisma.Decimal(d.unitPrice),
          unitVendorPrice: new Prisma.Decimal(d.unitVendorPrice),
          mealTypeId: BigInt(d.mealTypeId),
          active: d.active,
          ...(branchId !== undefined ? { branchId } : {}),
        },
      });
      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "foodItem.update",
          entity: "food_item",
          entityId: id,
          before: { code: before.code, unitPrice: before.unitPrice.toFixed(2) },
          after: { code: d.code, unitPrice: d.unitPrice },
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A food item with that code already exists." };
    }
    throw e;
  }

  revalidatePath("/settings/food-items");
  redirect("/settings/food-items?flash=updated");
}

export async function setFoodItemActiveAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("foodItems.manage");
  let id: bigint;
  try {
    id = BigInt(String(formData.get("id") ?? ""));
  } catch {
    return;
  }
  const active = String(formData.get("active")) === "true";

  const before = await prisma.foodItem.findUnique({ where: { id } });
  if (!before) return;
  if (actor.branchId && before.branchId && before.branchId.toString() !== actor.branchId) return;

  await prisma.$transaction(async (tx) => {
    await tx.foodItem.update({ where: { id }, data: { active } });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "foodItem.active", entity: "food_item", entityId: id, before: { active: before.active }, after: { active } },
      tx,
    );
  });

  revalidatePath("/settings/food-items");
}
