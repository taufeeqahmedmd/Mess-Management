import { prisma } from "@/lib/prisma";
import { formatDateTimeInZone } from "@/lib/time";
import { emitNotification } from "./notify";

/**
 * Emit a food-request lifecycle event with the standard variable set. Loads the
 * request fresh (post-commit), so callers just pass the id + any extra vars
 * (reason, stage). Best-effort like all emissions — never throws.
 */
export async function emitFoodRequestEvent(
  eventCode:
    | "foodRequest.raised"
    | "foodRequest.accepted"
    | "foodRequest.preparing"
    | "foodRequest.out_for_delivery"
    | "foodRequest.delivered"
    | "foodRequest.rejected"
    | "foodRequest.cancelled",
  requestId: bigint,
  extraVars: Record<string, string> = {},
): Promise<void> {
  try {
    const req = await prisma.foodRequest.findUnique({
      where: { id: requestId },
      include: { user: true, vendor: true, _count: { select: { items: true } } },
    });
    if (!req) return;

    await emitNotification(eventCode, {
      vars: {
        requestCode: req.code,
        cardholder: req.user.fullName,
        vendor: req.vendor?.name ?? "",
        items: String(req._count.items),
        location: req.deliveryLocation,
        requestedFor: formatDateTimeInZone(req.requestedFor),
        // Vendor-facing raise shows the payable-to-vendor; the delivered receipt
        // shows the request's sale value.
        amount: eventCode === "foodRequest.raised" ? req.vendorAmount.toFixed(2) : req.amount.toFixed(2),
        time: req.deliveredAt ? formatDateTimeInZone(req.deliveredAt) : "",
        ...extraVars,
      },
      cardholder: { email: req.user.email, phone: req.user.phone, branchId: req.branchId },
      vendorId: req.vendorId,
      requesterAppUserId: req.requestedByAppUserId,
    });
  } catch (e) {
    console.error(`food-request notification failed (${eventCode}):`, e);
  }
}
