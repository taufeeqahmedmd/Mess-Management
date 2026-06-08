"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/rbac";

export type CardState = { error?: string; success?: boolean };

async function loadUserScoped(actor: Actor, userId: bigint) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return null;
  if (actor.branchId && user.branchId.toString() !== actor.branchId) return null;
  return user;
}

function parseExpiry(formData: FormData): Date | null {
  const s = String(formData.get("expiresOn") ?? "").trim();
  return s ? new Date(s) : null;
}

/** Issue a new active card to a cardholder that has none active. */
export async function issueCardAction(
  _prev: CardState,
  formData: FormData,
): Promise<CardState> {
  const actor = await requirePermission("cards.replace");
  const userId = BigInt(String(formData.get("userId") ?? "0"));
  const cardUid = String(formData.get("cardUid") ?? "").trim();
  if (!cardUid) return { error: "Card UID is required." };

  const user = await loadUserScoped(actor, userId);
  if (!user) return { error: "Cardholder not found." };

  const active = await prisma.rfidCard.findFirst({ where: { userId, status: "active" } });
  if (active) return { error: "This cardholder already has an active card. Use Replace instead." };

  try {
    await prisma.$transaction(async (tx) => {
      const card = await tx.rfidCard.create({
        data: { cardUid, userId, status: "active", issuedAt: new Date(), expiresOn: parseExpiry(formData) },
      });
      await tx.cardEvent.create({
        data: { cardId: card.id, userId, type: "issue", newUid: cardUid, appUserId: BigInt(actor.id) },
      });
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "card.issue", entity: "rfid_card", entityId: card.id, after: { cardUid } },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That card UID is already in use." };
    }
    throw e;
  }

  revalidatePath(`/users/${userId}`);
  return { success: true };
}

/** Replace the active card: retire the old one, issue a new active one. */
export async function replaceCardAction(
  _prev: CardState,
  formData: FormData,
): Promise<CardState> {
  const actor = await requirePermission("cards.replace");
  const userId = BigInt(String(formData.get("userId") ?? "0"));
  const newUid = String(formData.get("newUid") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!newUid) return { error: "New card UID is required." };

  const user = await loadUserScoped(actor, userId);
  if (!user) return { error: "Cardholder not found." };

  const current = await prisma.rfidCard.findFirst({ where: { userId, status: "active" } });

  try {
    await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.rfidCard.update({ where: { id: current.id }, data: { status: "retired" } });
      }
      const card = await tx.rfidCard.create({
        data: { cardUid: newUid, userId, status: "active", issuedAt: new Date(), expiresOn: parseExpiry(formData) },
      });
      await tx.cardEvent.create({
        data: { cardId: card.id, userId, type: "replace", oldUid: current?.cardUid ?? null, newUid, reason, appUserId: BigInt(actor.id) },
      });
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "card.replace", entity: "rfid_card", entityId: card.id, before: { oldUid: current?.cardUid ?? null }, after: { newUid, reason } },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That card UID is already in use." };
    }
    throw e;
  }

  revalidatePath(`/users/${userId}`);
  return { success: true };
}

/** Activate or deactivate a specific card (one active per user enforced). */
export async function setCardStatusAction(formData: FormData): Promise<void> {
  const action = String(formData.get("action") ?? "");
  const permission = action === "activate" ? "cards.activate" : "cards.deactivate";
  const actor = await requirePermission(permission);

  const cardId = BigInt(String(formData.get("cardId") ?? "0"));
  const card = await prisma.rfidCard.findUnique({ where: { id: cardId } });
  if (!card) return;
  const user = await loadUserScoped(actor, card.userId);
  if (!user) return;

  if (action === "activate") {
    const other = await prisma.rfidCard.findFirst({
      where: { userId: card.userId, status: "active", id: { not: cardId } },
    });
    if (other) return; // one-active-per-user; deactivate the other first
  }

  const nextStatus = action === "activate" ? "active" : "blocked";

  await prisma.$transaction(async (tx) => {
    await tx.rfidCard.update({
      where: { id: cardId },
      data: { status: nextStatus, blockedAt: nextStatus === "blocked" ? new Date() : null },
    });
    await tx.cardEvent.create({
      data: {
        cardId,
        userId: card.userId,
        type: action === "activate" ? "activate" : "deactivate",
        appUserId: BigInt(actor.id),
      },
    });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: `card.${action}`, entity: "rfid_card", entityId: cardId, before: { status: card.status }, after: { status: nextStatus } },
      tx,
    );
  });

  revalidatePath(`/users/${card.userId}`);
}
