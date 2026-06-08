import { PERMISSIONS, type Permission } from "./rbac";

/**
 * Staff roles (plan.md §4.2) and their default permission grants. Super Admin
 * bypasses checks but is granted everything for completeness; Admin mirrors the
 * mock ("Admin always sees everything"). These seed the editable role × screen ×
 * action grid (Access Control screen) — Super Admin can change them later.
 */
export const ROLES = [
  "Super Admin",
  "Admin",
  "Mess Incharge",
  "Accountant",
  "Management",
] as const;

export type RoleName = (typeof ROLES)[number];

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  "Super Admin": PERMISSIONS,
  Admin: PERMISSIONS, // mock: Admin always sees everything (editable)
  "Mess Incharge": ["counter.operate", "vendorDashboard.view"],
  Accountant: [
    "dashboard.view",
    "users.view",
    "cards.view",
    "cards.replace",
    "cards.activate",
    "cards.deactivate",
    "recharge.view",
    "recharge.create",
    "recharge.edit",
    "recharge.import",
    "reports.view",
  ],
  Management: [
    "dashboard.view",
    "users.view",
    "cards.view",
    "recharge.view",
    "reports.view",
  ],
};

/** Roles that should always hold every permission (UI may render their grid read-only). */
export const SUPERUSER_ROLES: readonly RoleName[] = ["Super Admin"];
