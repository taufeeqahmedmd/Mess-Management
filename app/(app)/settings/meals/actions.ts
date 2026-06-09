"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export type MealFormState = { error?: string };
export type MealCountersState = { error?: string; success?: boolean };

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour).");

const mealSchema = z.object({
  code: z.string().trim().min(1, "Code is required.").max(30),
  name: z.string().trim().min(1, "Name is required.").max(80),
  startTime: time,
  endTime: time,
  active: z.boolean(),
});

function parse(formData: FormData) {
  return {
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    startTime: String(formData.get("startTime") ?? "").trim(),
    endTime: String(formData.get("endTime") ?? "").trim(),
    active: formData.get("active") === "on",
  };
}

export async function createMealAction(
  _prev: MealFormState,
  formData: FormData,
): Promise<MealFormState> {
  const actor = await requirePermission("meals.manage");
  const parsed = mealSchema.safeParse(parse(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.mealType.create({ data });
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "meal.create", entity: "meal_type", entityId: created.id, after: data },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A meal with that code already exists." };
    }
    throw e;
  }

  revalidatePath("/settings/meals");
  redirect("/settings/meals?flash=created");
}

export async function updateMealAction(
  _prev: MealFormState,
  formData: FormData,
): Promise<MealFormState> {
  const actor = await requirePermission("meals.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const parsed = mealSchema.safeParse(parse(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const before = await prisma.mealType.findUnique({ where: { id } });
  if (!before) return { error: "Meal not found." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.mealType.update({ where: { id }, data });
      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "meal.update",
          entity: "meal_type",
          entityId: id,
          before: { code: before.code, name: before.name, startTime: before.startTime, endTime: before.endTime, active: before.active },
          after: data,
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A meal with that code already exists." };
    }
    throw e;
  }

  revalidatePath("/settings/meals");
  redirect("/settings/meals?flash=updated");
}

/**
 * Assign which counters serve a meal, each with its own [start, end) window
 * (settings/meals → "Counters & service windows"). Branch-scoped: only counters
 * in the actor's branch are touched. Replaces the meal's assignments among those
 * counters atomically (delete + recreate the checked set).
 */
export async function assignMealCountersAction(
  _prev: MealCountersState,
  formData: FormData,
): Promise<MealCountersState> {
  const actor = await requirePermission("meals.manage");

  let mealTypeId: bigint;
  try {
    mealTypeId = BigInt(String(formData.get("mealId") ?? ""));
  } catch {
    return { error: "Invalid meal." };
  }
  const meal = await prisma.mealType.findUnique({ where: { id: mealTypeId } });
  if (!meal) return { error: "Meal not found." };

  const counters = await prisma.counter.findMany({
    where: {
      status: "active",
      deletedAt: null,
      ...(actor.branchId ? { branchId: BigInt(actor.branchId) } : {}),
    },
    select: { id: true },
  });
  const scopedIds = counters.map((c) => c.id);

  const rows: Array<{ counterId: bigint; mealTypeId: bigint; startTime: string; endTime: string; active: boolean }> = [];
  for (const c of counters) {
    if (formData.get(`counter_${c.id}`) !== "on") continue;
    const start = String(formData.get(`start_${c.id}`) ?? "").trim();
    const end = String(formData.get(`end_${c.id}`) ?? "").trim();
    if (!time.safeParse(start).success || !time.safeParse(end).success) {
      return { error: "Each selected counter needs a valid HH:MM start and end time." };
    }
    rows.push({ counterId: c.id, mealTypeId, startTime: start, endTime: end, active: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.counterMeal.deleteMany({ where: { mealTypeId, counterId: { in: scopedIds } } });
    if (rows.length) await tx.counterMeal.createMany({ data: rows });
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "meal.counters",
        entity: "meal_type",
        entityId: mealTypeId,
        after: { counters: rows.map((r) => ({ counterId: r.counterId.toString(), startTime: r.startTime, endTime: r.endTime })) },
      },
      tx,
    );
  });

  revalidatePath(`/settings/meals/${mealTypeId}/edit`);
  revalidatePath("/settings/meals");
  return { success: true };
}

export async function setMealActiveAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("meals.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const active = String(formData.get("active")) === "true";

  const before = await prisma.mealType.findUnique({ where: { id } });
  if (!before) return;

  await prisma.$transaction(async (tx) => {
    await tx.mealType.update({ where: { id }, data: { active } });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "meal.active", entity: "meal_type", entityId: id, before: { active: before.active }, after: { active } },
      tx,
    );
  });

  revalidatePath("/settings/meals");
}
