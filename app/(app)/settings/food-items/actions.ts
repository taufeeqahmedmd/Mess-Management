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

export async function createFoodItemAction(
  _prev: FoodItemFormState,
  formData: FormData,
): Promise<FoodItemFormState> {
  const actor = await requirePermission("foodItems.manage");
  const parsed = foodItemSchema.safeParse(parse(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  const data = {
    code: d.code,
    name: d.name,
    kind: d.kind,
    unitPrice: new Prisma.Decimal(d.unitPrice),
    unitVendorPrice: new Prisma.Decimal(d.unitVendorPrice),
    mealTypeId: BigInt(d.mealTypeId),
    branchId: actor.branchId ? BigInt(actor.branchId) : null, // scoped admin → own branch; super admin → all-branch
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
