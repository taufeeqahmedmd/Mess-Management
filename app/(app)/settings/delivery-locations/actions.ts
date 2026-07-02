"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type BranchStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/rbac";

export type LocationFormState = { error?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(150),
  branchId: z.string(),
  status: z.enum(["active", "inactive"]),
});

function parse(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    branchId: String(formData.get("branchId") ?? "").trim(),
    status: String(formData.get("status") ?? "active"),
  };
}

/** Scoped admins create in their own branch; all-branch admins pick a branch or "" = all branches. */
function resolveBranch(actor: Actor, input: string): bigint | null {
  if (actor.branchId) return BigInt(actor.branchId);
  return input ? BigInt(input) : null;
}

export async function createLocationAction(
  _prev: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const actor = await requirePermission("foodItems.manage");
  const parsed = schema.safeParse(parse(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  await prisma.$transaction(async (tx) => {
    const loc = await tx.deliveryLocation.create({
      data: { name: d.name, branchId: resolveBranch(actor, d.branchId), status: d.status as BranchStatus },
    });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "deliveryLocation.create", entity: "delivery_location", entityId: loc.id, after: { name: d.name } },
      tx,
    );
  });

  revalidatePath("/settings/delivery-locations");
  redirect("/settings/delivery-locations?flash=created");
}

export async function updateLocationAction(
  _prev: LocationFormState,
  formData: FormData,
): Promise<LocationFormState> {
  const actor = await requirePermission("foodItems.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const parsed = schema.safeParse(parse(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  const before = await prisma.deliveryLocation.findUnique({ where: { id } });
  if (!before) return { error: "Location not found." };
  if (actor.branchId && before.branchId?.toString() !== actor.branchId) return { error: "Out of your branch scope." };

  await prisma.$transaction(async (tx) => {
    await tx.deliveryLocation.update({
      where: { id },
      data: { name: d.name, branchId: resolveBranch(actor, d.branchId), status: d.status as BranchStatus },
    });
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "deliveryLocation.update",
        entity: "delivery_location",
        entityId: id,
        before: { name: before.name, status: before.status },
        after: { name: d.name, status: d.status },
      },
      tx,
    );
  });

  revalidatePath("/settings/delivery-locations");
  redirect("/settings/delivery-locations?flash=updated");
}

export async function setLocationStatusAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("foodItems.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const status: BranchStatus = String(formData.get("status")) === "inactive" ? "inactive" : "active";

  const before = await prisma.deliveryLocation.findUnique({ where: { id } });
  if (!before) return;
  if (actor.branchId && before.branchId?.toString() !== actor.branchId) return;

  await prisma.$transaction(async (tx) => {
    await tx.deliveryLocation.update({ where: { id }, data: { status } });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "deliveryLocation.status", entity: "delivery_location", entityId: id, before: { status: before.status }, after: { status } },
      tx,
    );
  });

  revalidatePath("/settings/delivery-locations");
}
