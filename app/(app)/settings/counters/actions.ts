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

const counterSchema = z.object({
  code: z.string().trim().min(1, "Code is required.").max(30),
  name: z.string().trim().min(1, "Name is required.").max(120),
  status: z.enum(["active", "inactive"]),
});

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
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "counter.create", entity: "counter", entityId: created.id, after: { ...data, branchId: branchId.toString() } },
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
