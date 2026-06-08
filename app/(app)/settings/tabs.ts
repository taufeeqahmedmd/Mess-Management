import type { Permission } from "@/lib/rbac";

/** Configurations tabs. Shown if the actor holds the tab's permission. */
export type SettingsTab = { href: string; label: string; permission: Permission };

export const SETTINGS_TABS: SettingsTab[] = [
  { href: "/settings/categories", label: "Categories", permission: "categories.manage" },
  { href: "/settings/meals", label: "Meals", permission: "meals.manage" },
  { href: "/settings/rates", label: "Rates", permission: "rates.manage" },
  { href: "/settings/consumption", label: "Consumption", permission: "categories.manage" },
  { href: "/settings/counters", label: "Counters", permission: "counters.manage" },
  { href: "/settings/staff", label: "Staff", permission: "staff.manage" },
];
