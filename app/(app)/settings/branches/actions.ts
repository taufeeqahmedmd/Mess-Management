"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type BranchStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export type BranchFormState = { error?: string };

const branchSchema = z.object({
  code: z.string().trim().min(1, "Code is required.").max(30),
  name: z.string().trim().min(1, "Name is required.").max(150),
  address: z.string().trim().max(255),
  collectorCode: z.string().trim().max(60),
  status: z.enum(["active", "inactive"]),
});

function parse(formData: FormData) {
  return {
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    collectorCode: String(formData.get("collectorCode") ?? "").trim(),
    status: String(formData.get("status") ?? "active"),
  };
}

export async function createBranchAction(
  _prev: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  const actor = await requirePermission("settings.manage");
  const parsed = branchSchema.safeParse(parse(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.branch.create({
        data: {
          code: data.code,
          name: data.name,
          address: data.address || null,
          collectorCode: data.collectorCode || null,
          status: data.status as BranchStatus,
          createdBy: BigInt(actor.id),
        },
      });
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "branch.create", entity: "branch", entityId: created.id, after: { ...data, address: data.address || null } },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A branch with that code already exists." };
    }
    throw e;
  }

  revalidatePath("/settings/branches");
  redirect("/settings/branches?flash=created");
}

export async function updateBranchAction(
  _prev: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  const actor = await requirePermission("settings.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const parsed = branchSchema.safeParse(parse(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const before = await prisma.branch.findUnique({ where: { id } });
  if (!before) return { error: "Branch not found." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.branch.update({
        where: { id },
        data: {
          code: data.code,
          name: data.name,
          address: data.address || null,
          collectorCode: data.collectorCode || null,
          status: data.status as BranchStatus,
          updatedBy: BigInt(actor.id),
        },
      });
      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "branch.update",
          entity: "branch",
          entityId: id,
          before: { code: before.code, name: before.name, address: before.address, status: before.status },
          after: { ...data, address: data.address || null },
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A branch with that code already exists." };
    }
    throw e;
  }

  revalidatePath("/settings/branches");
  redirect("/settings/branches?flash=updated");
}

export async function setBranchStatusAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("settings.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const status: BranchStatus = String(formData.get("status")) === "inactive" ? "inactive" : "active";

  const before = await prisma.branch.findUnique({ where: { id } });
  if (!before) return;

  await prisma.$transaction(async (tx) => {
    await tx.branch.update({ where: { id }, data: { status, updatedBy: BigInt(actor.id) } });
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "branch.status",
        entity: "branch",
        entityId: id,
        before: { status: before.status },
        after: { status },
      },
      tx,
    );
  });

  revalidatePath("/settings/branches");
}
