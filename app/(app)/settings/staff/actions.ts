"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { Prisma, type AppUserStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import type { Actor, Permission } from "@/lib/rbac";

export type StaffFormState = { error?: string };

const baseSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(150),
  mobile: z.string().trim().regex(/^\d{4,20}$/, "Mobile must be 4–20 digits."),
  roleId: z.string().min(1, "Role is required."),
  branchId: z.string(),
  status: z.enum(["active", "disabled", "locked"]),
});

function parse(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    mobile: String(formData.get("mobile") ?? "").trim(),
    roleId: String(formData.get("roleId") ?? "").trim(),
    branchId: String(formData.get("branchId") ?? "").trim(),
    status: String(formData.get("status") ?? "active"),
  };
}

/** Resolve the branch + role with scope/escalation guards. */
async function resolve(
  actor: Actor,
  roleId: string,
  branchIdRaw: string,
): Promise<{ branchId: bigint | null; roleId: bigint } | { error: string }> {
  const role = await prisma.role.findUnique({
    where: { id: BigInt(roleId) },
    include: { permissions: { include: { permission: { select: { code: true } } } } },
  });
  if (!role) return { error: "Invalid role." };
  if (role.name === "Super Admin" && !actor.isSuperAdmin) {
    return { error: "Only a Super Admin can assign the Super Admin role." };
  }
  // No privilege escalation: a non-Super-Admin can't assign a role that carries
  // a permission the actor doesn't hold themselves.
  if (!actor.isSuperAdmin) {
    const beyond = role.permissions.find((rp) => !actor.permissions.has(rp.permission.code as Permission));
    if (beyond) return { error: "You can't assign a role with permissions beyond your own." };
  }
  // Scoped admins can only create staff in their own branch.
  const branchId = actor.branchId
    ? BigInt(actor.branchId)
    : branchIdRaw
      ? BigInt(branchIdRaw)
      : null;
  return { branchId, roleId: role.id };
}

function parseCounterIds(formData: FormData): bigint[] {
  return formData
    .getAll("counterIds")
    .map((v) => {
      try {
        return BigInt(String(v));
      } catch {
        return null;
      }
    })
    .filter((v): v is bigint => v !== null);
}

/**
 * Sync this staff's counter assignments. The `CounterOperator` join is the single
 * source of truth shared with each counter's Operators list, so assigning here
 * reflects on the counters page and vice-versa. Only counters the staff may
 * actually operate survive: in the staff's branch (any branch when the staff is
 * all-branch) and within the actor's own scope — mirroring assignOperatorsAction.
 */
async function syncStaffCounters(
  tx: Prisma.TransactionClient,
  opts: { appUserId: bigint; staffBranchId: bigint | null; actorBranchId: bigint | null; requestedIds: bigint[] },
): Promise<bigint[]> {
  let validIds: bigint[] = [];
  if (opts.requestedIds.length) {
    const eligible = await tx.counter.findMany({
      where: {
        id: { in: opts.requestedIds },
        deletedAt: null,
        ...(opts.staffBranchId ? { branchId: opts.staffBranchId } : {}),
        ...(opts.actorBranchId ? { branchId: opts.actorBranchId } : {}),
      },
      select: { id: true },
    });
    validIds = eligible.map((c) => c.id);
  }
  await tx.counterOperator.deleteMany({ where: { appUserId: opts.appUserId } });
  if (validIds.length) {
    await tx.counterOperator.createMany({
      data: validIds.map((counterId) => ({ counterId, appUserId: opts.appUserId })),
    });
  }
  return validIds;
}

export async function createStaffAction(
  _prev: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const actor = await requirePermission("staff.manage");
  const input = parse(formData);
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const password = String(formData.get("password") ?? "");
  if (password.length < 6) return { error: "Password must be at least 6 characters." };

  const r = await resolve(actor, input.roleId, input.branchId);
  if ("error" in r) return r;

  const counterIds = parseCounterIds(formData);
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.appUser.create({
        data: { name: input.name, mobile: input.mobile, roleId: r.roleId, branchId: r.branchId, status: "active", passwordHash },
      });
      const assignedCounters = await syncStaffCounters(tx, {
        appUserId: created.id,
        staffBranchId: r.branchId,
        actorBranchId: actor.branchId ? BigInt(actor.branchId) : null,
        requestedIds: counterIds,
      });
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "staff.create", entity: "app_user", entityId: created.id, after: { name: input.name, mobile: input.mobile, roleId: r.roleId.toString(), branchId: r.branchId?.toString() ?? null, counterIds: assignedCounters.map(String) } },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That mobile number is already in use." };
    }
    throw e;
  }

  revalidatePath("/settings/staff");
  revalidatePath("/settings/counters");
  redirect("/settings/staff?flash=created");
}

export async function updateStaffAction(
  _prev: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const actor = await requirePermission("staff.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const input = parse(formData);
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  if (id === BigInt(actor.id) && input.status !== "active") {
    return { error: "You can't disable your own account." };
  }

  const before = await prisma.appUser.findUnique({ where: { id } });
  if (!before) return { error: "Staff member not found." };
  // Branch scope: a scoped admin may only edit staff inside their own branch
  // (all-branch staff are Super-Admin-only territory).
  if (actor.branchId && before.branchId?.toString() !== actor.branchId) {
    return { error: "Out of your branch scope." };
  }

  const r = await resolve(actor, input.roleId, input.branchId);
  if ("error" in r) return r;

  const data: Prisma.AppUserUpdateInput = {
    name: input.name,
    mobile: input.mobile,
    role: { connect: { id: r.roleId } },
    branch: r.branchId ? { connect: { id: r.branchId } } : { disconnect: true },
    status: input.status as AppUserStatus,
  };

  const password = String(formData.get("password") ?? "");
  if (password) {
    if (password.length < 6) return { error: "Password must be at least 6 characters." };
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const counterIds = parseCounterIds(formData);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appUser.update({ where: { id }, data });
      const assignedCounters = await syncStaffCounters(tx, {
        appUserId: id,
        staffBranchId: r.branchId,
        actorBranchId: actor.branchId ? BigInt(actor.branchId) : null,
        requestedIds: counterIds,
      });
      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "staff.update",
          entity: "app_user",
          entityId: id,
          before: { name: before.name, mobile: before.mobile, roleId: before.roleId.toString(), branchId: before.branchId?.toString() ?? null, status: before.status },
          after: { name: input.name, mobile: input.mobile, roleId: r.roleId.toString(), branchId: r.branchId?.toString() ?? null, status: input.status, passwordChanged: Boolean(password), counterIds: assignedCounters.map(String) },
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That mobile number is already in use." };
    }
    throw e;
  }

  revalidatePath("/settings/staff");
  revalidatePath("/settings/counters");
  redirect("/settings/staff?flash=updated");
}

export async function setStaffStatusAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("staff.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const status: AppUserStatus = String(formData.get("status")) === "active" ? "active" : "disabled";

  if (id === BigInt(actor.id) && status !== "active") return; // no self-disable

  const before = await prisma.appUser.findUnique({ where: { id } });
  if (!before) return;
  if (actor.branchId && before.branchId?.toString() !== actor.branchId) return; // out of scope

  await prisma.$transaction(async (tx) => {
    await tx.appUser.update({ where: { id }, data: { status } });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "staff.status", entity: "app_user", entityId: id, before: { status: before.status }, after: { status } },
      tx,
    );
  });

  revalidatePath("/settings/staff");
}
