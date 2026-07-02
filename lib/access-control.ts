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
  "Vendor",
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
    "foodRequests.view",
    "reports.view",
    "settlements.view",
    "settlements.manage",
  ],
  Management: [
    "dashboard.view",
    "users.view",
    "cards.view",
    "recharge.view",
    "foodRequests.view",
    "reports.view",
    "settlements.view",
  ],
  // Vendor portal: a caterer login that only acts on its own assigned requests
  // (accept/reject/preparing/out-for-delivery/deliver). Branch-scoped via the
  // linked Vendor's app_user. No access to money admin or cardholder data.
  Vendor: ["foodRequests.vendor"],
};

/** Roles that should always hold every permission (UI renders their grid read-only). */
export const SUPERUSER_ROLES: readonly RoleName[] = ["Super Admin"];

/**
 * The admin-facing Access Control grid (plan.md §4 — mock's role × screen ×
 * action matrix), mapped to the real `module.action` permission catalog. Each
 * screen lists the actions that apply to it; toggling a cell grants/revokes the
 * mapped permission for the selected role.
 */
export type ScreenAction = { action: string; label: string; permission: Permission };
export type AccessScreen = { key: string; label: string; actions: ScreenAction[] };

export const ACCESS_SCREENS: readonly AccessScreen[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    actions: [{ action: "view", label: "View", permission: "dashboard.view" }],
  },
  {
    key: "vendorDashboard",
    label: "Vendor Dashboard",
    actions: [{ action: "view", label: "View", permission: "vendorDashboard.view" }],
  },
  {
    key: "counter",
    label: "Counter",
    actions: [{ action: "operate", label: "Operate", permission: "counter.operate" }],
  },
  {
    key: "users",
    label: "Cardholders",
    actions: [
      { action: "view", label: "View", permission: "users.view" },
      { action: "create", label: "Add", permission: "users.create" },
      { action: "edit", label: "Edit", permission: "users.edit" },
      { action: "delete", label: "Delete", permission: "users.delete" },
      { action: "import", label: "Import", permission: "users.import" },
    ],
  },
  {
    key: "cards",
    label: "RFID Cards",
    actions: [
      { action: "view", label: "View", permission: "cards.view" },
      { action: "replace", label: "Replace", permission: "cards.replace" },
      { action: "activate", label: "Activate", permission: "cards.activate" },
      { action: "deactivate", label: "Deactivate", permission: "cards.deactivate" },
    ],
  },
  {
    key: "recharge",
    label: "Recharge",
    actions: [
      { action: "view", label: "View", permission: "recharge.view" },
      { action: "create", label: "Add", permission: "recharge.create" },
      { action: "edit", label: "Edit", permission: "recharge.edit" },
      { action: "delete", label: "Delete", permission: "recharge.delete" },
      { action: "import", label: "Import", permission: "recharge.import" },
    ],
  },
  {
    key: "foodRequests",
    label: "Food Requests",
    actions: [
      { action: "view", label: "View", permission: "foodRequests.view" },
      { action: "create", label: "Add", permission: "foodRequests.create" },
      { action: "edit", label: "Edit", permission: "foodRequests.edit" },
      { action: "cancel", label: "Cancel", permission: "foodRequests.cancel" },
      { action: "approve", label: "Approve", permission: "foodRequests.approve" },
      { action: "vendor", label: "Vendor", permission: "foodRequests.vendor" },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    actions: [{ action: "view", label: "View", permission: "reports.view" }],
  },
  {
    key: "settlements",
    label: "Vendor Settlement",
    actions: [
      { action: "view", label: "View", permission: "settlements.view" },
      { action: "manage", label: "Manage", permission: "settlements.manage" },
    ],
  },
  {
    key: "configurations",
    label: "Configurations",
    actions: [
      { action: "categories", label: "Categories", permission: "categories.manage" },
      { action: "meals", label: "Meals", permission: "meals.manage" },
      { action: "rates", label: "Rates", permission: "rates.manage" },
      { action: "vendorRates", label: "Vendor Rates", permission: "vendorRates.manage" },
      { action: "counters", label: "Counters", permission: "counters.manage" },
      { action: "foodItems", label: "Food Items", permission: "foodItems.manage" },
      { action: "settings", label: "Settings", permission: "settings.manage" },
    ],
  },
  {
    key: "accessControl",
    label: "Access Control",
    actions: [
      { action: "manage", label: "Grid", permission: "accessControl.manage" },
      { action: "roles", label: "Roles", permission: "roles.manage" },
      { action: "staff", label: "Staff", permission: "staff.manage" },
    ],
  },
];
