"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { PERMISSIONS, type Permission } from "@/lib/rbac";

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export type SaveRoleState = { error?: string; success?: boolean; savedRoles?: string[] };

/**
 * Replace permission grants for every editable role from the Access Control
 * matrix in one transaction. Guarded by accessControl.manage; the Super Admin
 * role is locked and skipped. Only roles whose grants actually changed are
 * touched, and each writes its own audit row.
 *
 * Payload shape (hidden `payload` field): { [roleId]: permissionCode[] }.
 *
 * Note: authorization is re-read from the DB on every request (lib/session), so
 * grant changes take effect on the affected staff's next action — no re-login.
 */
export async function saveAccessControlAction(
  _prev: SaveRoleState,
  formData: FormData,
): Promise<SaveRoleState> {
  const actor = await requirePermission("accessControl.manage");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { error: "Could not read the submitted changes." };
  }
  if (typeof payload !== "object" || payload === null) {
    return { error: "Could not read the submitted changes." };
  }

  // Self-heal: make sure every catalog permission has a row before we map codes
  // to ids. A DB seeded before a permission was added to the catalog (e.g.
  // foodRequests.vendor, vendorDashboard.view) would otherwise be missing that
  // row — the code would map to `undefined` and the grant would silently never
  // save. Idempotent (skipDuplicates), so it's a no-op once the table is in sync.
  await prisma.permission.createMany({
    data: PERMISSIONS.map((code) => ({ code, module: code.split(".")[0] })),
    skipDuplicates: true,
  });

  const [roles, allPerms] = await Promise.all([
    prisma.role.findMany({
      orderBy: { id: "asc" },
      include: { permissions: { select: { permissionId: true } } },
    }),
    prisma.permission.findMany({ select: { id: true, code: true } }),
  ]);

  const idByCode = new Map(allPerms.map((p) => [p.code, p.id]));
  const codeById = new Map(allPerms.map((p) => [p.id.toString(), p.code]));

  // Build the set of role updates that actually changed, so we don't churn the
  // ledger of audit rows for untouched roles.
  type Update = { roleId: bigint; name: string; permIds: bigint[]; before: string[]; after: string[] };
  const updates: Update[] = [];

  for (const role of roles) {
    if (role.name === "Super Admin") continue; // locked — always full access
    const desiredRaw = payload[role.id.toString()];
    if (!Array.isArray(desiredRaw)) continue; // role not present in payload

    const after = [...new Set(desiredRaw.map(String).filter((c) => PERMISSION_SET.has(c)))].sort();

    // No privilege escalation: a non-Super-Admin can only grant permissions they
    // themselves hold (defence-in-depth — prevents a limited role that happens
    // to carry accessControl.manage from minting capabilities it lacks).
    if (!actor.isSuperAdmin) {
      const beyond = after.find((c) => !actor.permissions.has(c as Permission));
      if (beyond) return { error: "You can only grant permissions you hold yourself." };
    }
    const before = role.permissions
      .map((rp) => codeById.get(rp.permissionId.toString()))
      .filter((c): c is string => Boolean(c))
      .sort();

    if (before.length === after.length && before.every((c, i) => c === after[i])) {
      continue; // unchanged
    }

    updates.push({
      roleId: role.id,
      name: role.name,
      permIds: after.map((c) => idByCode.get(c)).filter((id): id is bigint => id != null),
      before,
      after,
    });
  }

  if (updates.length === 0) {
    return { success: true, savedRoles: [] };
  }

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.rolePermission.deleteMany({ where: { roleId: u.roleId } });
      if (u.permIds.length) {
        await tx.rolePermission.createMany({
          data: u.permIds.map((permissionId) => ({ roleId: u.roleId, permissionId })),
        });
      }
      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "accessControl.update",
          entity: "role",
          entityId: u.roleId,
          before: { permissions: u.before },
          after: { permissions: u.after },
        },
        tx,
      );
    }
  });

  revalidatePath("/access-control");
  return { success: true, savedRoles: updates.map((u) => u.name) };
}
