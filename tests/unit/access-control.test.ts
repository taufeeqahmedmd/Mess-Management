import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERMISSIONS, type Actor, type Permission } from "@/lib/rbac";

/**
 * Access Control save (`saveAccessControlAction`) — the permission-granting path.
 * Covers: the no-privilege-escalation guard (a non-super-admin can only grant
 * permissions it holds), the missing-permission-row self-heal (seed drift), the
 * Super Admin lock, unchanged-role skipping, and malformed payload rejection.
 * Auth/session, DB, and audit are mocked at the module boundary.
 */

const permissionCreateMany = vi.fn();
const roleFindMany = vi.fn();
const permissionFindMany = vi.fn();
const rolePermissionDeleteMany = vi.fn();
const rolePermissionCreateMany = vi.fn();
const writeAudit = vi.fn();

let actor: Actor;

const txMock = {
  rolePermission: { deleteMany: rolePermissionDeleteMany, createMany: rolePermissionCreateMany },
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requirePermission: async () => actor }));
vi.mock("@/lib/audit", () => ({ writeAudit: (...a: unknown[]) => writeAudit(...a) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    permission: {
      createMany: (...a: unknown[]) => permissionCreateMany(...a),
      findMany: (...a: unknown[]) => permissionFindMany(...a),
    },
    role: { findMany: (...a: unknown[]) => roleFindMany(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock),
  },
}));

import { saveAccessControlAction } from "@/app/(app)/access-control/actions";

const superAdmin = (): Actor => ({
  id: "1",
  isSuperAdmin: true,
  permissions: new Set<Permission>(PERMISSIONS),
  branchId: null,
});

const limitedAdmin = (perms: Permission[]): Actor => ({
  id: "2",
  isSuperAdmin: false,
  permissions: new Set<Permission>(perms),
  branchId: null,
});

function formWith(payload: unknown): FormData {
  const fd = new FormData();
  fd.set("payload", typeof payload === "string" ? payload : JSON.stringify(payload));
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  actor = superAdmin();
  // Catalog table: only 3 rows exist (simulating a DB seeded before newer codes).
  permissionFindMany.mockResolvedValue([
    { id: BigInt(1), code: "dashboard.view" },
    { id: BigInt(2), code: "users.view" },
    { id: BigInt(3), code: "recharge.create" },
  ]);
  roleFindMany.mockResolvedValue([
    { id: BigInt(1), name: "Super Admin", permissions: [] },
    { id: BigInt(2), name: "Admin", permissions: [{ permissionId: BigInt(1) }] }, // holds dashboard.view
  ]);
  rolePermissionDeleteMany.mockResolvedValue({ count: 1 });
  rolePermissionCreateMany.mockResolvedValue({ count: 2 });
});

describe("saveAccessControlAction", () => {
  it("self-heals the permission catalog before mapping codes to ids", async () => {
    await saveAccessControlAction({}, formWith({ "2": ["dashboard.view", "users.view"] }));
    expect(permissionCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: expect.arrayContaining([{ code: "dashboard.view", module: "dashboard" }]),
      }),
    );
    // Every catalog code is backfilled, not just the toggled ones.
    const data = permissionCreateMany.mock.calls[0][0].data as { code: string }[];
    expect(data).toHaveLength(PERMISSIONS.length);
  });

  it("saves changed grants: replaces the role's rows and audits before/after", async () => {
    const r = await saveAccessControlAction({}, formWith({ "2": ["dashboard.view", "users.view"] }));
    expect(r).toEqual({ success: true, savedRoles: ["Admin"] });

    expect(rolePermissionDeleteMany).toHaveBeenCalledWith({ where: { roleId: BigInt(2) } });
    expect(rolePermissionCreateMany).toHaveBeenCalledWith({
      data: [
        { roleId: BigInt(2), permissionId: BigInt(1) },
        { roleId: BigInt(2), permissionId: BigInt(2) },
      ],
    });
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "accessControl.update",
        before: { permissions: ["dashboard.view"] },
        after: { permissions: ["dashboard.view", "users.view"] },
      }),
      txMock,
    );
  });

  it("skips roles whose grants did not change (no writes, empty savedRoles)", async () => {
    const r = await saveAccessControlAction({}, formWith({ "2": ["dashboard.view"] }));
    expect(r).toEqual({ success: true, savedRoles: [] });
    expect(rolePermissionDeleteMany).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("never touches the locked Super Admin role, even if present in the payload", async () => {
    const r = await saveAccessControlAction({}, formWith({ "1": ["dashboard.view"], "2": ["dashboard.view"] }));
    expect(r).toEqual({ success: true, savedRoles: [] });
    expect(rolePermissionDeleteMany).not.toHaveBeenCalled();
  });

  it("blocks privilege escalation: a non-super-admin can only grant permissions it holds", async () => {
    actor = limitedAdmin(["accessControl.manage", "dashboard.view"]);
    const r = await saveAccessControlAction({}, formWith({ "2": ["dashboard.view", "users.view"] }));
    expect(r).toEqual({ error: "You can only grant permissions you hold yourself." });
    expect(rolePermissionDeleteMany).not.toHaveBeenCalled();
  });

  it("allows a non-super-admin to grant within its own permission set", async () => {
    actor = limitedAdmin(["accessControl.manage", "dashboard.view", "users.view"]);
    const r = await saveAccessControlAction({}, formWith({ "2": ["dashboard.view", "users.view"] }));
    expect(r).toEqual({ success: true, savedRoles: ["Admin"] });
  });

  it("drops unknown permission codes instead of writing them", async () => {
    const r = await saveAccessControlAction({}, formWith({ "2": ["dashboard.view", "not.a.permission"] }));
    // "not.a.permission" is filtered by the catalog; only dashboard.view remains → unchanged.
    expect(r).toEqual({ success: true, savedRoles: [] });
  });

  it("rejects malformed payloads without writing", async () => {
    expect(await saveAccessControlAction({}, formWith("{not json"))).toEqual({
      error: "Could not read the submitted changes.",
    });
    expect(rolePermissionDeleteMany).not.toHaveBeenCalled();
  });
});
