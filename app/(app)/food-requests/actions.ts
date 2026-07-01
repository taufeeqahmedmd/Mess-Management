"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import {
  priceLines,
  parseItemsJson,
  parseApprovalConfig,
  resolveInitialStatus,
  requestCode,
  isEditable,
  isCancellable,
  type CatalogItem,
  type LineInput,
} from "@/services/food-request";

export type FoodRequestFormState = { error?: string };

/** Common parse + validation for create/edit. Returns typed fields or an error. */
async function parseAndPrice(
  formData: FormData,
  actorBranchId: string | null,
): Promise<
  | { error: string }
  | {
      userId: bigint;
      vendorId: bigint | null;
      deliveryLocation: string;
      requestedFor: Date;
      purpose: string | null;
      lines: { mealTypeId: bigint; foodItemId: bigint; qty: number; unitPrice: Prisma.Decimal; unitVendorPrice: Prisma.Decimal; description: string | null }[];
      amount: Prisma.Decimal;
      vendorAmount: Prisma.Decimal;
      user: { id: bigint; branchId: bigint };
    }
> {
  let userId: bigint;
  try {
    userId = BigInt(String(formData.get("userId") ?? ""));
  } catch {
    return { error: "Pick a cardholder." };
  }

  const deliveryLocation = String(formData.get("deliveryLocation") ?? "").trim();
  const requestedForStr = String(formData.get("requestedFor") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim() || null;
  const vendorIdStr = String(formData.get("vendorId") ?? "").trim();

  if (!deliveryLocation) return { error: "Delivery location is required." };
  if (deliveryLocation.length > 150) return { error: "Delivery location is too long." };
  if (!requestedForStr) return { error: "Pick a delivery date & time." };
  const requestedFor = new Date(requestedForStr);
  if (Number.isNaN(requestedFor.getTime())) return { error: "Invalid delivery date & time." };

  const parsedLines = parseItemsJson(String(formData.get("items") ?? ""));
  if ("error" in parsedLines) return { error: parsedLines.error };
  const lineInputs: LineInput[] = parsedLines;

  // Cardholder (the RFID account charged) — must be active and in scope.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return { error: "Cardholder not found." };
  if (user.status !== "active") return { error: "Cardholder is not active." };
  if (actorBranchId && user.branchId.toString() !== actorBranchId) {
    return { error: "Out of your branch scope." };
  }

  // Vendor (required) — must exist and be active.
  if (!vendorIdStr) return { error: "Select a vendor." };
  let vendorId: bigint;
  try {
    vendorId = BigInt(vendorIdStr);
  } catch {
    return { error: "Invalid vendor." };
  }
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || vendor.status !== "active") return { error: "Vendor not found or inactive." };

  // Catalog snapshot — only active items visible to this user's branch.
  const ids = lineInputs.map((l) => l.foodItemId);
  const items = await prisma.foodItem.findMany({
    where: {
      id: { in: ids },
      active: true,
      OR: [{ branchId: null }, { branchId: user.branchId }],
    },
  });
  const catalog = new Map<string, CatalogItem>(
    items.map((i) => [
      i.id.toString(),
      {
        id: i.id,
        mealTypeId: i.mealTypeId,
        unitPrice: i.unitPrice,
        unitVendorPrice: i.unitVendorPrice,
        active: i.active,
      },
    ]),
  );

  const priced = priceLines(lineInputs, catalog);
  if ("error" in priced) return { error: priced.error };

  return {
    userId,
    vendorId,
    deliveryLocation,
    requestedFor,
    purpose,
    lines: priced.lines,
    amount: priced.amount,
    vendorAmount: priced.vendorAmount,
    user: { id: user.id, branchId: user.branchId },
  };
}

export async function createFoodRequestAction(
  _prev: FoodRequestFormState,
  formData: FormData,
): Promise<FoodRequestFormState> {
  const actor = await requirePermission("foodRequests.create");

  const parsed = await parseAndPrice(formData, actor.branchId);
  if ("error" in parsed) return { error: parsed.error };
  const { userId, vendorId, deliveryLocation, requestedFor, purpose, lines, amount, vendorAmount, user } = parsed;

  // Approval config decides whether the request waits for an approver.
  const setting = await prisma.setting.findUnique({ where: { settingKey: "food_request_approval" } });
  const config = parseApprovalConfig(setting?.value);
  const { status, approvalRequired } = resolveInitialStatus(config, amount);

  let newId: bigint;
  try {
    newId = await prisma.$transaction(async (tx) => {
      const created = await tx.foodRequest.create({
        data: {
          // Unique placeholder that fits code's VARCHAR(30); replaced with the
          // real FR-###### reference below, once the autoincrement id exists.
          code: `T${randomUUID().replace(/-/g, "")}`.slice(0, 30),
          branchId: user.branchId,
          userId,
          requestedByAppUserId: BigInt(actor.id),
          vendorId,
          deliveryLocation,
          requestedFor,
          purpose,
          status,
          amount,
          vendorAmount,
          approvalRequired,
        },
      });
      const code = requestCode(created.id);
      await tx.foodRequest.update({ where: { id: created.id }, data: { code } });

      await tx.foodRequestItem.createMany({
        data: lines.map((l) => ({
          requestId: created.id,
          foodItemId: l.foodItemId,
          mealTypeId: l.mealTypeId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          unitVendorPrice: l.unitVendorPrice,
          description: l.description,
        })),
      });

      await tx.foodRequestEvent.create({
        data: { requestId: created.id, fromStatus: null, toStatus: status, note: "Request raised", appUserId: BigInt(actor.id) },
      });

      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "foodRequest.create",
          entity: "food_request",
          entityId: created.id,
          after: { code, userId: userId.toString(), amount: amount.toFixed(2), status, items: lines.length },
        },
        tx,
      );
      return created.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2003" || e.code === "P2025")) {
      return { error: "Invalid cardholder, vendor, or item." };
    }
    throw e;
  }

  revalidatePath("/food-requests");
  redirect(`/food-requests/${newId}?flash=created`);
}

export async function editFoodRequestAction(
  _prev: FoodRequestFormState,
  formData: FormData,
): Promise<FoodRequestFormState> {
  const actor = await requirePermission("foodRequests.edit");

  let id: bigint;
  try {
    id = BigInt(String(formData.get("requestId") ?? ""));
  } catch {
    return { error: "Invalid request." };
  }

  const existing = await prisma.foodRequest.findUnique({ where: { id } });
  if (!existing) return { error: "Request not found." };
  if (actor.branchId && existing.branchId.toString() !== actor.branchId) {
    return { error: "Out of your branch scope." };
  }
  if (!isEditable(existing.status)) return { error: "This request can no longer be edited." };

  const parsed = await parseAndPrice(formData, actor.branchId);
  if ("error" in parsed) return { error: parsed.error };
  const { userId, vendorId, deliveryLocation, requestedFor, purpose, lines, amount, vendorAmount } = parsed;
  if (userId !== existing.userId) return { error: "The charged cardholder can't be changed — cancel and raise a new request." };

  const setting = await prisma.setting.findUnique({ where: { settingKey: "food_request_approval" } });
  const config = parseApprovalConfig(setting?.value);
  let { status, approvalRequired } = resolveInitialStatus(config, amount);
  // An edit must never WEAKEN an approval requirement: a request already in
  // `pending_approval` stays pending after editing (even if the new total drops
  // below the auto-approve threshold), so an approver can't be bypassed by lowering
  // the amount. Editing a `raised` request may still tighten to pending if it now
  // crosses the threshold.
  if (existing.status === "pending_approval") {
    status = "pending_approval";
    approvalRequired = true;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.foodRequestItem.deleteMany({ where: { requestId: id } });
      await tx.foodRequestItem.createMany({
        data: lines.map((l) => ({
          requestId: id,
          foodItemId: l.foodItemId,
          mealTypeId: l.mealTypeId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          unitVendorPrice: l.unitVendorPrice,
          description: l.description,
        })),
      });
      await tx.foodRequest.update({
        where: { id },
        data: { vendorId, deliveryLocation, requestedFor, purpose, amount, vendorAmount, status, approvalRequired },
      });
      await tx.foodRequestEvent.create({
        data: { requestId: id, fromStatus: existing.status, toStatus: status, note: "Request edited", appUserId: BigInt(actor.id) },
      });
      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "foodRequest.edit",
          entity: "food_request",
          entityId: id,
          before: { amount: existing.amount.toFixed(2), status: existing.status },
          after: { amount: amount.toFixed(2), status, items: lines.length },
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2003" || e.code === "P2025")) {
      return { error: "Invalid vendor or item." };
    }
    throw e;
  }

  revalidatePath("/food-requests");
  revalidatePath(`/food-requests/${id}`);
  redirect(`/food-requests/${id}?flash=updated`);
}

/** Approve a request waiting in `pending_approval` → makes it vendor-visible. */
export async function approveFoodRequestAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("foodRequests.approve");
  let id: bigint;
  try {
    id = BigInt(String(formData.get("id") ?? ""));
  } catch {
    return;
  }

  const existing = await prisma.foodRequest.findUnique({ where: { id } });
  if (!existing) return;
  if (actor.branchId && existing.branchId.toString() !== actor.branchId) return;
  if (existing.status !== "pending_approval") return;

  await prisma.$transaction(async (tx) => {
    await tx.foodRequest.update({
      where: { id },
      data: { status: "approved", approvedByAppUserId: BigInt(actor.id), approvedAt: new Date() },
    });
    await tx.foodRequestEvent.create({
      data: { requestId: id, fromStatus: "pending_approval", toStatus: "approved", note: "Approved", appUserId: BigInt(actor.id) },
    });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "foodRequest.approve", entity: "food_request", entityId: id },
      tx,
    );
  });

  revalidatePath("/food-requests");
  revalidatePath(`/food-requests/${id}`);
}

export type RejectState = { error?: string; success?: boolean };

/** Reject a request waiting in `pending_approval`, with a required reason. */
export async function rejectFoodRequestAction(
  _prev: RejectState,
  formData: FormData,
): Promise<RejectState> {
  const actor = await requirePermission("foodRequests.approve");
  let id: bigint;
  try {
    id = BigInt(String(formData.get("requestId") ?? ""));
  } catch {
    return { error: "Invalid request." };
  }
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Enter a reason for rejecting." };
  if (reason.length > 255) return { error: "Reason is too long." };

  const existing = await prisma.foodRequest.findUnique({ where: { id } });
  if (!existing) return { error: "Request not found." };
  if (actor.branchId && existing.branchId.toString() !== actor.branchId) return { error: "Out of your branch scope." };
  if (existing.status !== "pending_approval") return { error: "This request is no longer pending approval." };

  await prisma.$transaction(async (tx) => {
    await tx.foodRequest.update({ where: { id }, data: { status: "rejected", rejectReason: reason } });
    await tx.foodRequestEvent.create({
      data: { requestId: id, fromStatus: "pending_approval", toStatus: "rejected", note: reason, appUserId: BigInt(actor.id) },
    });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "foodRequest.reject", entity: "food_request", entityId: id, after: { reason } },
      tx,
    );
  });

  revalidatePath("/food-requests");
  revalidatePath(`/food-requests/${id}`);
  return { success: true };
}

/** Cancel a request that hasn't reached a terminal state. */
export async function cancelFoodRequestAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("foodRequests.cancel");
  let id: bigint;
  try {
    id = BigInt(String(formData.get("id") ?? ""));
  } catch {
    return;
  }

  const existing = await prisma.foodRequest.findUnique({ where: { id } });
  if (!existing) return;
  if (actor.branchId && existing.branchId.toString() !== actor.branchId) return;
  if (!isCancellable(existing.status)) return;

  await prisma.$transaction(async (tx) => {
    await tx.foodRequest.update({ where: { id }, data: { status: "cancelled" } });
    await tx.foodRequestEvent.create({
      data: { requestId: id, fromStatus: existing.status, toStatus: "cancelled", note: "Cancelled by admin", appUserId: BigInt(actor.id) },
    });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "foodRequest.cancel", entity: "food_request", entityId: id, before: { status: existing.status } },
      tx,
    );
  });

  revalidatePath("/food-requests");
  revalidatePath(`/food-requests/${id}`);
}
