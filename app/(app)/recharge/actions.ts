"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { applyRecharge, reverseRechargeRemaining } from "@/services/recharge-ledger";
import { validateRechargeInput } from "@/services/recharge";
import { expireRecharges, expireUserValidities } from "@/services/expiry";

export type RechargeFormState = { error?: string };

export async function createRechargeAction(
  _prev: RechargeFormState,
  formData: FormData,
): Promise<RechargeFormState> {
  const actor = await requirePermission("recharge.create");

  let userId: bigint;
  try {
    userId = BigInt(String(formData.get("userId") ?? ""));
  } catch {
    return { error: "Invalid cardholder." };
  }

  const amount = String(formData.get("amount") ?? "").trim() || "0";
  const paymentModeId = String(formData.get("paymentModeId") ?? "").trim();
  const validTillStr = String(formData.get("validTill") ?? "").trim();
  const remarks = String(formData.get("remarks") ?? "").trim() || null;

  const coupons: { mealTypeId: string; count: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("coupon_")) {
      const n = Number.parseInt(String(value), 10);
      if (Number.isInteger(n) && n > 0) coupons.push({ mealTypeId: key.slice(7), count: n });
    }
  }

  const invalid = validateRechargeInput({ amount, coupons });
  if (invalid) return { error: invalid };
  if (!paymentModeId) return { error: "Select a payment mode." };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return { error: "Cardholder not found." };
  if (user.status !== "active") return { error: "Cardholder is not active." };
  if (actor.branchId && user.branchId.toString() !== actor.branchId) {
    return { error: "Out of your branch scope." };
  }

  let validTill: Date | null = null;
  if (validTillStr) {
    validTill = new Date(validTillStr);
    if (Number.isNaN(validTill.getTime())) return { error: "Invalid validity date." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const r = await applyRecharge(tx, {
        userId,
        amount: new Prisma.Decimal(amount),
        coupons: coupons.map((c) => ({ mealTypeId: BigInt(c.mealTypeId), count: c.count })),
        validFrom: null,
        validTill,
        paymentModeId: BigInt(paymentModeId),
        counterId: null,
        appUserId: BigInt(actor.id),
        remarks,
        clientUuid: randomUUID(),
      });
      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "recharge.create",
          entity: "recharge",
          entityId: r.id,
          after: { userId: userId.toString(), amount, coupons: coupons.length },
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return { error: "Duplicate recharge — please retry." };
      if (e.code === "P2003" || e.code === "P2025") return { error: "Invalid payment mode or meal." };
    }
    throw e;
  }

  revalidatePath("/recharge");
  revalidatePath(`/users/${userId}`);
  redirect("/recharge?flash=created");
}

/**
 * Edit a posted recharge: reverse its unspent remainder, then apply the new
 * values as a fresh recharge (plan §6.3). Already-consumed amounts are untouched.
 */
export async function editRechargeAction(
  _prev: RechargeFormState,
  formData: FormData,
): Promise<RechargeFormState> {
  const actor = await requirePermission("recharge.edit");

  let oldId: bigint;
  let userId: bigint;
  try {
    oldId = BigInt(String(formData.get("rechargeId") ?? ""));
    userId = BigInt(String(formData.get("userId") ?? ""));
  } catch {
    return { error: "Invalid recharge." };
  }

  const amount = String(formData.get("amount") ?? "").trim() || "0";
  const paymentModeId = String(formData.get("paymentModeId") ?? "").trim();
  const validTillStr = String(formData.get("validTill") ?? "").trim();
  const remarks = String(formData.get("remarks") ?? "").trim() || null;

  const coupons: { mealTypeId: string; count: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("coupon_")) {
      const n = Number.parseInt(String(value), 10);
      if (Number.isInteger(n) && n > 0) coupons.push({ mealTypeId: key.slice(7), count: n });
    }
  }

  const invalid = validateRechargeInput({ amount, coupons });
  if (invalid) return { error: invalid };
  if (!paymentModeId) return { error: "Select a payment mode." };

  const old = await prisma.recharge.findUnique({ where: { id: oldId }, include: { user: true } });
  if (!old) return { error: "Recharge not found." };
  if (old.status !== "posted") return { error: "Only posted recharges can be edited." };
  if (old.userId !== userId) return { error: "Cardholder mismatch." };
  if (actor.branchId && old.user.branchId.toString() !== actor.branchId) {
    return { error: "Out of your branch scope." };
  }

  let validTill: Date | null = null;
  if (validTillStr) {
    validTill = new Date(validTillStr);
    if (Number.isNaN(validTill.getTime())) return { error: "Invalid validity date." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await reverseRechargeRemaining(tx, oldId, "reversal", BigInt(actor.id));
      const r = await applyRecharge(tx, {
        userId,
        amount: new Prisma.Decimal(amount),
        coupons: coupons.map((c) => ({ mealTypeId: BigInt(c.mealTypeId), count: c.count })),
        validFrom: null,
        validTill,
        paymentModeId: BigInt(paymentModeId),
        counterId: null,
        appUserId: BigInt(actor.id),
        remarks,
        clientUuid: randomUUID(),
      });
      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "recharge.edit",
          entity: "recharge",
          entityId: r.id,
          before: { rechargeId: oldId.toString() },
          after: { amount, coupons: coupons.length },
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Duplicate recharge — please retry." };
    }
    throw e;
  }

  revalidatePath("/recharge");
  revalidatePath(`/users/${userId}`);
  redirect("/recharge?flash=updated");
}

/** Reverse (claw back the unspent remaining of) a posted recharge. */
export async function reverseRechargeAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("recharge.delete");
  let id: bigint;
  try {
    id = BigInt(String(formData.get("id") ?? ""));
  } catch {
    return;
  }

  const recharge = await prisma.recharge.findUnique({ where: { id }, include: { user: true } });
  if (!recharge) return;
  if (actor.branchId && recharge.user.branchId.toString() !== actor.branchId) return;

  await prisma.$transaction(async (tx) => {
    const ok = await reverseRechargeRemaining(tx, id, "reversal", BigInt(actor.id));
    if (ok) {
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "recharge.reverse", entity: "recharge", entityId: id },
        tx,
      );
    }
  });

  revalidatePath("/recharge");
  revalidatePath(`/users/${recharge.userId}`);
}

export type ExpiryState = { error?: string; success?: boolean; message?: string };

/** Manual expiry sweep: claw back expired recharges + zero expired validities. */
export async function runExpiryAction(): Promise<ExpiryState> {
  const actor = await requirePermission("recharge.edit");
  const recharges = await expireRecharges(prisma);
  const validities = await expireUserValidities(prisma);
  await writeAudit({
    appUserId: BigInt(actor.id),
    action: "expiry.run",
    entity: "system",
    after: { recharges, validities },
  });
  revalidatePath("/recharge");
  return {
    success: true,
    message: `Expired ${recharges} recharge(s) and ${validities} validit${validities === 1 ? "y" : "ies"}.`,
  };
}
