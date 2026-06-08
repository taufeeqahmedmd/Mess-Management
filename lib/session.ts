import { redirect } from "next/navigation";
import { auth } from "./auth";
import {
  type Actor,
  type Permission,
  requirePermission as requirePermissionPure,
} from "./rbac";

/**
 * Bridges the Auth.js session to the pure `Actor` that rbac.ts guards expect.
 * Use these in Server Components / Server Actions / Route Handlers — never trust
 * the client for identity or permissions.
 */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    isSuperAdmin: session.user.isSuperAdmin,
    permissions: new Set<Permission>(session.user.permissions),
    branchId: session.user.branchId,
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
