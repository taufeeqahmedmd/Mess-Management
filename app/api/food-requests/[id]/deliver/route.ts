import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { vendorForActor } from "@/lib/vendor";
import { runFulfillment } from "@/lib/run-fulfillment";
import { emitFoodRequestEvent } from "@/lib/notifications/food-request";

const schema = z.object({
  cardUid: z.string().trim().min(1).max(64),
  clientTxId: z.string().uuid(),
});

/**
 * POST /api/food-requests/[id]/deliver — vendor confirms delivery by scanning the
 * cardholder's RFID card. Records the delivery via the shared redemption ledger
 * only after the tap is verified (coupon-only: the cardholder is not charged).
 * Idempotent on the request (a replay returns the original result, never
 * double-posts).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(actor, "foodRequests.vendor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: idStr } = await params;
  let requestId: bigint;
  try {
    requestId = BigInt(idStr);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // The request must belong to the active vendor this staff member is attached to.
  const vendor = await vendorForActor(actor.id);
  if (!vendor) return NextResponse.json({ error: "No vendor is linked to your account." }, { status: 403 });
  const request = await prisma.foodRequest.findUnique({ where: { id: requestId }, select: { vendorId: true } });
  if (!request || request.vendorId !== vendor.id) {
    return NextResponse.json({ error: "This order isn't assigned to you." }, { status: 403 });
  }

  const result = await runFulfillment(
    {
      requestId,
      cardUid: parsed.data.cardUid,
      clientUuid: parsed.data.clientTxId,
      vendorAppUserId: BigInt(actor.id),
      at: new Date(),
    },
    { appUserId: BigInt(actor.id) },
  );

  // Notify only on the FIRST successful delivery — idempotent replays stay silent.
  if (result.status === "DELIVERED" && result.reason !== "Already delivered") {
    await emitFoodRequestEvent("foodRequest.delivered", requestId);
  }

  return NextResponse.json(result);
}
