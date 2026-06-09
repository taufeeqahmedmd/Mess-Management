import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./prisma";
import {
  type Actor,
  type Permission,
  requirePermission as requirePermissionPure,
} from "./rbac";

/**
 * Bridges the Auth.js session to the pure `Actor` that rbac.ts guards expect.
 * Use these in Server Components / Server Actions / Route Handlers — never trust
 * the client for identity or permissions.
 *
 * The JWT only *authenticates* (proves who you are); authorization data
 * (status, permissions, branch scope) is re-read fresh from the DB on every
 * request so a revoked role, a branch reassignment, or a disabled/locked account
 * takes effect immediately instead of lingering until the long-lived token
 * expires (a privilege-persistence hole in a money system). A disabled/locked or
 * deleted account resolves to `null` → treated as unauthenticated.
 */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return null;

  let id: bigint;
  try {
    id = BigInt(uid);
  } catch {
    return null;
  }

  const user = await prisma.appUser.findUnique({
    where: { id },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });
  if (!user || user.deletedAt || user.status !== "active") return null;

  return {
    id: user.id.toString(),
    isSuperAdmin: user.role.name === "Super Admin",
    permissions: new Set<Permission>(
      user.role.permissions.map((rp) => rp.permission.code as Permission),
    ),
    branchId: user.branchId ? user.branchId.toString() : null,
  };
}

/** Returns the actor or redirects to /login. For protected pages/actions. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

/** Returns the actor or throws AuthorizationError if the permission is missing. */
export async function requirePermission(permission: Permission): Promise<Actor> {
  const actor = await requireActor();
  requirePermissionPure(actor, permission);
  return actor;
}
