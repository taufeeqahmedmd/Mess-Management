"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { Prisma, type AppUserStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/rbac";

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
  const role = await prisma.role.findUnique({ where: { id: BigInt(roleId) } });
  if (!role) return { error: "Invalid role." };
  if (role.name === "Super Admin" && !actor.isSuperAdmin) {
    return { error: "Only a Super Admin can assign the Super Admin role." };
  }
  // Scoped admins can only create staff in their own branch.
  const branchId = actor.branchId
    ? BigInt(actor.branchId)
    : branchIdRaw
      ? BigInt(branchIdRaw)
      : null;
  return { branchId, roleId: role.id };
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

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.appUser.create({
        data: { name: input.name, mobile: input.mobile, roleId: r.roleId, branchId: r.branchId, status: "active", passwordHash },
      });
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "staff.create", entity: "app_user", entityId: created.id, after: { name: input.name, mobile: input.mobile, roleId: r.roleId.toString(), branchId: r.branchId?.toString() ?? null } },
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
  redirect("/settings/staff");
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

  try {
    await prisma.$transaction(async (tx) => {
      await tx.appUser.update({ where: { id }, data });
      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "staff.update",
          entity: "app_user",
          entityId: id,
          before: { name: before.name, mobile: before.mobile, roleId: before.roleId.toString(), branchId: before.branchId?.toString() ?? null, status: before.status },
          after: { name: input.name, mobile: input.mobile, roleId: r.roleId.toString(), branchId: r.branchId?.toString() ?? null, status: input.status, passwordChanged: Boolean(password) },
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
  redirect("/settings/staff");
}

export async function setStaffStatusAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("staff.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const status: AppUserStatus = String(formData.get("status")) === "active" ? "active" : "disabled";

  if (id === BigInt(actor.id) && status !== "active") return; // no self-disable

  const before = await prisma.appUser.findUnique({ where: { id } });
  if (!before) return;

  await prisma.$transaction(async (tx) => {
    await tx.appUser.update({ where: { id }, data: { status } });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "staff.status", entity: "app_user", entityId: id, before: { status: before.status }, after: { status } },
      tx,
    );
  });

  revalidatePath("/settings/staff");
}
