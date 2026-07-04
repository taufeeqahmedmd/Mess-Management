import { type Actor, type Permission, can } from "./rbac";

/**
 * Priority-ordered map of "a permission unlocks this landing route". The first
 * entry an actor satisfies is their home screen. Order = rough importance per
 * role (a counter operator lands on the counter, a vendor on their orders, …).
 */
const LANDING_ROUTES: readonly { permission: Permission; route: string }[] = [
  { permission: "dashboard.view", route: "/dashboard" },
  { permission: "counter.operate", route: "/counter" },
  { permission: "foodRequests.vendor", route: "/vendor-orders" },
  { permission: "vendorDashboard.view", route: "/vendor-dashboard" },
  { permission: "foodRequests.view", route: "/food-requests" },
  { permission: "recharge.view", route: "/recharge" },
  { permission: "reports.view", route: "/reports" },
  { permission: "settlements.view", route: "/settlements" },
];

/**
 * The best landing route for an actor — the first screen they can actually open.
 * Used by `/` and the dashboard fallback so a role without `dashboard.view`
 * (e.g. Vendor, Mess Incharge) lands on a screen it can use instead of bouncing.
 */
export function landingFor(actor: Actor): string {
  for (const { permission, route } of LANDING_ROUTES) if (can(actor, permission)) return route;
  return "/account";
}

/**
 * The counter's "Exit" target: the best screen the operator can open OTHER than
 * the counter itself. `null` when the counter is the only place they can go — in
 * which case the counter shows a Logout button instead of Exit.
 */
export function exitFromCounter(actor: Actor): string | null {
  for (const { permission, route } of LANDING_ROUTES) {
    if (route === "/counter") continue;
    if (can(actor, permission)) return route;
  }
  return null;
}
