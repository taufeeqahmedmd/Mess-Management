"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/rbac";

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export type SaveRoleState = { error?: string; success?: boolean };

/**
 * Replace a role's permission grants from the Access Control grid. Guarded by
 * accessControl.manage; the Super Admin role is locked. Writes an audit row.
 *
 * Note: permissions ride on the JWT, so affected staff see changes after their
 * next sign-in.
 */
export async function saveRolePermissionsAction(
  _prev: SaveRoleState,
  formData: FormData,
): Promise<SaveRoleState> {
  const actor = await requirePermission("accessControl.manage");

  const roleIdRaw = String(formData.get("roleId") ?? "");
  let roleId: bigint;
  try {
    roleId = BigInt(roleIdRaw);
  } catch {
    return { error: "Invalid role." };
  }

  const codes = formData
    .getAll("permissions")
    .map(String)
    .filter((c) => PERMISSION_SET.has(c));

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return { error: "Role not found." };
  if (role.name === "Super Admin") {
    return { error: "The Super Admin role cannot be modified." };
  }

  const perms = await prisma.permission.findMany({
    where: { code: { in: codes } },
    select: { id: true },
  });
  const before = await prisma.rolePermission.findMany({
    where: { roleId },
    select: { permissionId: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (perms.length) {
      await tx.rolePermission.createMany({
        data: perms.map((p) => ({ roleId, permissionId: p.id })),
      });
    }
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "accessControl.update",
        entity: "role",
        entityId: roleId,
        before: { permissionIds: before.map((b) => b.permissionId.toString()) },
        after: { permissions: codes },
      },
      tx,
    );
  });

  revalidatePath("/access-control");
  return { success: true };
}
