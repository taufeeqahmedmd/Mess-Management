/**
 * Roles whose staff must be attached to a vendor. When a staff member is given
 * one of these roles (Settings → Staff), a mandatory vendor picker appears and
 * the server requires it. Plain module so both the client form and the server
 * action can share the exact same rule.
 */
export const VENDOR_LINKED_ROLES = ["Vendor", "Vendor manager", "Mess Incharge"] as const;

export function roleNeedsVendor(roleName: string | undefined): boolean {
  return roleName != null && (VENDOR_LINKED_ROLES as readonly string[]).includes(roleName);
}
