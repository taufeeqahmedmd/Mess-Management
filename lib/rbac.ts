/**
 * RBAC primitives — deny by default. Permissions are `module.action` strings
 * (plan.md §4). Super Admin bypasses all checks. Every Server Action / Route
 * Handler must call `requirePermission` before doing work (see api rules).
 *
 * The actual session wiring (resolving the actor from Auth.js) lands in Phase 1;
 * this module defines the catalog + the pure guard so it can be unit-tested now.
 */

export const PERMISSIONS = [
  "dashboard.view",
  "vendorDashboard.view",
  "users.view",
  "users.create",
  "users.edit",
  "users.delete",
  "users.import",
  "cards.view",
  "cards.replace",
  "cards.activate",
  "cards.deactivate",
  "recharge.view",
  "recharge.create",
  "recharge.edit",
  "recharge.delete",
  "recharge.import",
  "counter.operate",
  "foodRequests.view",
  "foodRequests.create",
  "foodRequests.edit",
  "foodRequests.cancel",
  "foodRequests.approve",
  "foodRequests.vendor",
  "foodItems.manage",
  "settlements.view",
  "settlements.manage",
  "categories.manage",
  "meals.manage",
  "rates.manage",
  "vendorRates.manage",
  "counters.manage",
  "reports.view",
  "settings.manage",
  "roles.manage",
  "staff.manage",
  "accessControl.manage",
  "notifications.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Permissions that unlock at least one global-search group (services/search.ts).
 *  Used to gate the navbar search box so it isn't shown to staff who can't search. */
export const SEARCHABLE_PERMISSIONS = [
  "users.view",
  "staff.manage",
  "counters.manage",
  "settlements.view",
] as const satisfies readonly Permission[];

/** The minimal actor shape needed to authorize. `branchId === null` = all-branch. */
export type Actor = {
  id: string;
  isSuperAdmin: boolean;
  permissions: ReadonlySet<Permission>;
  branchId: string | null;
};

export class AuthorizationError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Missing required permission: ${permission}`);
    this.name = "AuthorizationError";
  }
}

/** Pure predicate — Super Admin bypasses; otherwise must hold the permission. */
export function can(actor: Actor, permission: Permission): boolean {
  return actor.isSuperAdmin || actor.permissions.has(permission);
}

/** Throws AuthorizationError when the actor lacks the permission. */
export function requirePermission(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) {
    throw new AuthorizationError(permission);
  }
}

/**
 * Branch scoping (database.md): all-branch actors see everything; scoped actors
 * are confined to their own branch.
 */
export function canAccessBranch(actor: Actor, branchId: string): boolean {
  return actor.branchId === null || actor.branchId === branchId;
}
