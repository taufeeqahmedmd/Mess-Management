import { type Actor, can } from "./rbac";

/**
 * The best landing route for an actor — the first screen they can actually open.
 * Used by the dashboard fallback (and anywhere a generic "home" is needed) so a
 * role without `dashboard.view` (e.g. Vendor, Mess Incharge) doesn't bounce
 * between screens it can't access. Order = rough importance per role.
 */
export function landingFor(actor: Actor): string {
  if (can(actor, "dashboard.view")) return "/dashboard";
  if (can(actor, "counter.operate")) return "/counter";
  if (can(actor, "foodRequests.vendor")) return "/vendor-orders";
  if (can(actor, "vendorDashboard.view")) return "/vendor-dashboard";
  if (can(actor, "foodRequests.view")) return "/food-requests";
  if (can(actor, "recharge.view")) return "/recharge";
  if (can(actor, "reports.view")) return "/reports";
  if (can(actor, "settlements.view")) return "/settlements";
  return "/account";
}
