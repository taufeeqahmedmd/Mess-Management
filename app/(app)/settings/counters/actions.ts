"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type CounterStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/rbac";

export type CounterFormState = { error?: string };
export type OperatorsState = { error?: string; success?: boolean };
export type CounterMealsState = { error?: string; success?: boolean };

const counterSchema = z.object({
  code: z.string().trim().min(1, "Code is required.").max(30),
  name: z.string().trim().min(1, "Name is required.").max(120),
  status: z.enum(["active", "inactive"]),
});

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Clamp a counter's [start,end) into the meal's default [defStart,defEnd) so a
 * counter never opens a meal outside its default window (operator decision:
 * clamp, don't reject). Only the common non-overnight case is trimmed precisely;
 * an overnight default (or counter) falls back to the meal's default window,
 * which is trivially contained.
 */
function clampWindow(start: string, end: string, defStart: string, defEnd: string): { start: string; end: string } {
  const s = toMin(start), e = toMin(end), ds = toMin(defStart), de = toMin(defEnd);
  if (ds <= de && s <= e) {
    const cs = Math.min(Math.max(s, ds), de);
    const ce = Math.min(Math.max(e, ds), de);
    if (cs < ce) return { start: toHHMM(cs), end: toHHMM(ce) };
  }
  return { start: defStart, end: defEnd };
}

type MealDef = { id: bigint; startTime: string; endTime: string };

/** Parse the ticked meals + their (clamped) per-counter windows from the form. */
function parseCounterMeals(formData: FormData, meals: MealDef[]) {
  const rows: Array<{ mealTypeId: bigint; startTime: string; endTime: string }> = [];
  for (const m of meals) {
    if (formData.get(`meal_${m.id}`) !== "on") continue;
    let start = String(formData.get(`start_${m.id}`) ?? "").trim();
    let end = String(formData.get(`end_${m.id}`) ?? "").trim();
    if (!HHMM.test(start)) start = m.startTime;
    if (!HHMM.test(end)) end = m.endTime;
    const w = clampWindow(start, end, m.startTime, m.endTime);
    rows.push({ mealTypeId: m.id, startTime: w.start, endTime: w.end });
  }
  return rows;
}

function parseOperatorIds(formData: FormData): bigint[] {
  return formData
    .getAll("operators")
    .map((v) => {
      try {
        return BigInt(String(v));
      } catch {
        return null;
      }
    })
    .filter((v): v is bigint => v !== null);
}

function parse(formData: FormData) {
  return {
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    status: String(formData.get("status") ?? "active"),
  };
}

/**
 * Resolve which branch a new counter belongs to. A scoped actor is pinned to
 * their own branch. An all-branch (Super Admin) actor may pass an explicit
 * branchId (validated to exist) — only falling back to the first branch when
 * none is supplied, so a counter isn't silently mis-filed under the wrong branch.
 */
async function resolveBranchId(actor: Actor, requestedBranchId: string): Promise<bigint | null> {
  if (actor.branchId) return BigInt(actor.branchId);
  if (requestedBranchId) {
    let id: bigint;
    try {
      id = BigInt(requestedBranchId);
    } catch {
      return null;
    }
    const branch = await prisma.branch.findUnique({ where: { id }, select: { id: true } });
    return branch ? branch.id : null;
  }
  const b = await prisma.branch.findFirst({ orderBy: { id: "asc" } });
  return b ? b.id : null;
}

export async function createCounterAction(
  _prev: CounterFormState,
  formData: FormData,
): Promise<CounterFormState> {
  const actor = await requirePermission("counters.manage");
  const parsed = counterSchema.safeParse(parse(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;
  const branchId = await resolveBranchId(actor, String(formData.get("branchId") ?? "").trim());
  if (branchId === null) return { error: "No branch configured yet — create one under Settings → Branches first." };

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.counter.create({
        data: { branchId, code: data.code, name: data.name, status: data.status as CounterStatus },
      });

      // Meals & service windows for this counter (clamped into each meal's default).
      const meals = await tx.mealType.findMany({ where: { active: true }, select: { id: true, startTime: true, endTime: true } });
      const mealRows = parseCounterMeals(formData, meals);
      if (mealRows.length) {
        await tx.counterMeal.createMany({
          data: mealRows.map((r) => ({ counterId: created.id, mealTypeId: r.mealTypeId, startTime: r.startTime, endTime: r.endTime, active: true })),
        });
      }

      // Operators — only staff in this counter's branch (or all-branch staff).
      const requestedOps = parseOperatorIds(formData);
      let opIds: bigint[] = [];
      if (requestedOps.length) {
        const validStaff = await tx.appUser.findMany({
          where: { id: { in: requestedOps }, deletedAt: null, OR: [{ branchId }, { branchId: null }] },
          select: { id: true },
        });
        opIds = validStaff.map((s) => s.id);
        if (opIds.length) {
          await tx.counterOperator.createMany({ data: opIds.map((appUserId) => ({ counterId: created.id, appUserId })) });
        }
      }

      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "counter.create",
          entity: "counter",
          entityId: created.id,
          after: { ...data, branchId: branchId.toString(), meals: mealRows.length, operators: opIds.length },
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A counter with that code already exists in this branch." };
    }
    throw e;
  }

  revalidatePath("/settings/counters");
  redirect("/settings/counters?flash=created");
}

export async function updateCounterAction(
  _prev: CounterFormState,
  formData: FormData,
): Promise<CounterFormState> {
  const actor = await requirePermission("counters.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const parsed = counterSchema.safeParse(parse(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const before = await prisma.counter.findUnique({ where: { id } });
  if (!before) return { error: "Counter not found." };
  if (actor.branchId && before.branchId.toString() !== actor.branchId) {
    return { error: "Out of your branch scope." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.counter.update({ where: { id }, data: { code: data.code, name: data.name, status: data.status as CounterStatus } });
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "counter.update", entity: "counter", entityId: id, before: { code: before.code, name: before.name, status: before.status }, after: data },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A counter with that code already exists in this branch." };
    }
    throw e;
  }

  revalidatePath("/settings/counters");
  redirect("/settings/counters?flash=updated");
}

export async function setCounterStatusAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("counters.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const status: CounterStatus = String(formData.get("status")) === "inactive" ? "inactive" : "active";

  const before = await prisma.counter.findUnique({ where: { id } });
  if (!before) return;
  if (actor.branchId && before.branchId.toString() !== actor.branchId) return; // out of scope

  await prisma.$transaction(async (tx) => {
    await tx.counter.update({ where: { id }, data: { status } });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "counter.status", entity: "counter", entityId: id, before: { status: before.status }, after: { status } },
      tx,
    );
  });

  revalidatePath("/settings/counters");
}

export async function assignOperatorsAction(
  _prev: OperatorsState,
  formData: FormData,
): Promise<OperatorsState> {
  const actor = await requirePermission("counters.manage");
  const counterId = BigInt(String(formData.get("counterId") ?? "0"));

  const counter = await prisma.counter.findUnique({ where: { id: counterId } });
  if (!counter) return { error: "Counter not found." };
  if (actor.branchId && counter.branchId.toString() !== actor.branchId) {
    return { error: "Out of your branch scope." };
  }

  const requested = formData.getAll("operators").map((v) => {
    try {
      return BigInt(String(v));
    } catch {
      return null;
    }
  });
  const requestedIds = requested.filter((v): v is bigint => v !== null);

  // Only staff in this counter's branch (or all-branch staff) may operate it —
  // prevents attaching another branch's staff as operators.
  const validStaff = await prisma.appUser.findMany({
    where: {
      id: { in: requestedIds },
      deletedAt: null,
      OR: [{ branchId: counter.branchId }, { branchId: null }],
    },
    select: { id: true },
  });
  const validIds = validStaff.map((s) => s.id);

  await prisma.$transaction(async (tx) => {
    await tx.counterOperator.deleteMany({ where: { counterId } });
    if (validIds.length) {
      await tx.counterOperator.createMany({
        data: validIds.map((appUserId) => ({ counterId, appUserId })),
      });
    }
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "counter.operators", entity: "counter", entityId: counterId, after: { operatorIds: validIds.map(String) } },
      tx,
    );
  });

  revalidatePath(`/settings/counters/${counterId}/edit`);
  revalidatePath("/settings/counters");
  return { success: true };
}

/**
 * Set which meals this counter serves and each meal's per-counter window
 * (settings/counters → "Meals & service windows"). Windows are clamped into each
 * meal's default. Replaces the counter's full meal set atomically.
 */
export async function assignCounterMealsAction(
  _prev: CounterMealsState,
  formData: FormData,
): Promise<CounterMealsState> {
  const actor = await requirePermission("counters.manage");
  let counterId: bigint;
  try {
    counterId = BigInt(String(formData.get("counterId") ?? ""));
  } catch {
    return { error: "Invalid counter." };
  }

  const counter = await prisma.counter.findUnique({ where: { id: counterId } });
  if (!counter) return { error: "Counter not found." };
  if (actor.branchId && counter.branchId.toString() !== actor.branchId) {
    return { error: "Out of your branch scope." };
  }

  const meals = await prisma.mealType.findMany({ where: { active: true }, select: { id: true, startTime: true, endTime: true } });
  const rows = parseCounterMeals(formData, meals);

  await prisma.$transaction(async (tx) => {
    await tx.counterMeal.deleteMany({ where: { counterId } });
    if (rows.length) {
      await tx.counterMeal.createMany({
        data: rows.map((r) => ({ counterId, mealTypeId: r.mealTypeId, startTime: r.startTime, endTime: r.endTime, active: true })),
      });
    }
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "counter.meals",
        entity: "counter",
        entityId: counterId,
        after: { meals: rows.map((r) => ({ mealTypeId: r.mealTypeId.toString(), startTime: r.startTime, endTime: r.endTime })) },
      },
      tx,
    );
  });

  revalidatePath(`/settings/counters/${counterId}/edit`);
  revalidatePath("/settings/counters");
  return { success: true };
}
