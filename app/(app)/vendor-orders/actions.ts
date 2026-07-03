"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { vendorForActor } from "@/lib/vendor";
import { vendorCanDecide, vendorAdvanceTarget } from "@/services/food-request";
import { emitFoodRequestEvent } from "@/lib/notifications/food-request";

export type VendorActionState = { error?: string; success?: boolean };

/** Load a request and confirm it belongs to the actor's vendor. */
async function ownedRequest(actorId: string, id: bigint) {
  const vendor = await vendorForActor(actorId);
  if (!vendor) return null;
  const req = await prisma.foodRequest.findUnique({ where: { id } });
  if (!req || req.vendorId !== vendor.id) return null;
  return req;
}

/** Vendor accepts a request assigned to them → `vendor_accepted`. */
export async function vendorAcceptAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("foodRequests.vendor");
  let id: bigint;
  try {
    id = BigInt(String(formData.get("id") ?? ""));
  } catch {
    return;
  }
  const req = await ownedRequest(actor.id, id);
  if (!req || !vendorCanDecide(req.status)) return;

  await prisma.$transaction(async (tx) => {
    await tx.foodRequest.update({ where: { id }, data: { status: "vendor_accepted" } });
    await tx.foodRequestEvent.create({
      data: { requestId: id, fromStatus: req.status, toStatus: "vendor_accepted", note: "Accepted by vendor", appUserId: BigInt(actor.id) },
    });
    await writeAudit({ appUserId: BigInt(actor.id), action: "foodRequest.vendorAccept", entity: "food_request", entityId: id }, tx);
  });

  await emitFoodRequestEvent("foodRequest.accepted", id);
  revalidatePath("/vendor-orders");
  revalidatePath(`/vendor-orders/${id}`);
}

/** Vendor advances preparation: vendor_accepted → preparing → out_for_delivery. */
export async function vendorAdvanceAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("foodRequests.vendor");
  let id: bigint;
  try {
    id = BigInt(String(formData.get("id") ?? ""));
  } catch {
    return;
  }
  const req = await ownedRequest(actor.id, id);
  if (!req) return;
  const target = vendorAdvanceTarget(req.status);
  if (!target) return;

  await prisma.$transaction(async (tx) => {
    await tx.foodRequest.update({ where: { id }, data: { status: target } });
    await tx.foodRequestEvent.create({
      data: { requestId: id, fromStatus: req.status, toStatus: target, note: `Marked ${target.replace(/_/g, " ")}`, appUserId: BigInt(actor.id) },
    });
    await writeAudit({ appUserId: BigInt(actor.id), action: "foodRequest.vendorAdvance", entity: "food_request", entityId: id, after: { status: target } }, tx);
  });

  await emitFoodRequestEvent(target === "preparing" ? "foodRequest.preparing" : "foodRequest.out_for_delivery", id);
  revalidatePath("/vendor-orders");
  revalidatePath(`/vendor-orders/${id}`);
}

/** Vendor rejects a request (with a required reason) before taking it on. */
export async function vendorRejectAction(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  const actor = await requirePermission("foodRequests.vendor");
  let id: bigint;
  try {
    id = BigInt(String(formData.get("requestId") ?? ""));
  } catch {
    return { error: "Invalid request." };
  }
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Enter a reason for rejecting." };
  if (reason.length > 255) return { error: "Reason is too long." };

  const req = await ownedRequest(actor.id, id);
  if (!req) return { error: "Request not found." };
  if (!vendorCanDecide(req.status)) return { error: "This request can no longer be rejected." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.foodRequest.update({ where: { id }, data: { status: "rejected", rejectReason: reason } });
      await tx.foodRequestEvent.create({
        data: { requestId: id, fromStatus: req.status, toStatus: "rejected", note: reason, appUserId: BigInt(actor.id) },
      });
      await writeAudit({ appUserId: BigInt(actor.id), action: "foodRequest.vendorReject", entity: "food_request", entityId: id, after: { reason } }, tx);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) return { error: "Could not reject — please retry." };
    throw e;
  }

  await emitFoodRequestEvent("foodRequest.rejected", id, { reason });
  revalidatePath("/vendor-orders");
  revalidatePath(`/vendor-orders/${id}`);
  return { success: true };
}
