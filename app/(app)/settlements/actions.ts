"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type BranchStatus, type SettlementStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { canAccessBranch, type Actor } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { resolvePeriod, settlementTotals, overlappingSettlement, settlementStatusLabel } from "@/services/settlement";

export type VendorFormState = { error?: string };
export type SettlementFormState = { error?: string };

// ---------------------------------------------------------------- vendors

const vendorSchema = z.object({
  code: z.string().trim().min(1, "Code is required.").max(30),
  name: z.string().trim().min(1, "Name is required.").max(150),
  gstin: z.string().trim().max(20).optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]),
});

function parseVendor(formData: FormData) {
  return {
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    gstin: String(formData.get("gstin") ?? "").trim(),
    status: String(formData.get("status") ?? "active"),
  };
}

export async function createVendorAction(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const actor = await requirePermission("settlements.manage");
  const parsed = vendorSchema.safeParse(parseVendor(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.vendor.create({
        data: { code: d.code, name: d.name, gstin: d.gstin || null, status: d.status as BranchStatus },
      });
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "vendor.create", entity: "vendor", entityId: created.id, after: d },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A vendor with that code already exists." };
    }
    throw e;
  }

  revalidatePath("/settlements/vendors");
  redirect("/settlements/vendors?flash=created");
}

export async function updateVendorAction(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const actor = await requirePermission("settlements.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const parsed = vendorSchema.safeParse(parseVendor(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  const before = await prisma.vendor.findUnique({ where: { id } });
  if (!before) return { error: "Vendor not found." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.vendor.update({
        where: { id },
        data: { code: d.code, name: d.name, gstin: d.gstin || null, status: d.status as BranchStatus },
      });
      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "vendor.update",
          entity: "vendor",
          entityId: id,
          before: { code: before.code, name: before.name, gstin: before.gstin, status: before.status },
          after: d,
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A vendor with that code already exists." };
    }
    throw e;
  }

  revalidatePath("/settlements/vendors");
  redirect("/settlements/vendors?flash=updated");
}

export async function setVendorStatusAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("settlements.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const status: BranchStatus = String(formData.get("status")) === "inactive" ? "inactive" : "active";

  const before = await prisma.vendor.findUnique({ where: { id } });
  if (!before) return;

  await prisma.$transaction(async (tx) => {
    await tx.vendor.update({ where: { id }, data: { status } });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "vendor.status", entity: "vendor", entityId: id, before: { status: before.status }, after: { status } },
      tx,
    );
  });

  revalidatePath("/settlements/vendors");
}

// ---------------------------------------------------------------- settlements

async function resolveBranchForActor(actor: Actor, formBranchId: string): Promise<bigint | { error: string }> {
  if (actor.branchId) return BigInt(actor.branchId); // scoped staff: their branch only
  if (!formBranchId) return { error: "Select a branch." };
  let id: bigint;
  try {
    id = BigInt(formBranchId);
  } catch {
    return { error: "Invalid branch." };
  }
  return id;
}

export async function generateSettlementAction(
  _prev: SettlementFormState,
  formData: FormData,
): Promise<SettlementFormState> {
  const actor = await requirePermission("settlements.manage");

  let vendorId: bigint;
  try {
    vendorId = BigInt(String(formData.get("vendorId") ?? ""));
  } catch {
    return { error: "Select a vendor." };
  }

  const branchResolved = await resolveBranchForActor(actor, String(formData.get("branchId") ?? ""));
  if (typeof branchResolved === "object") return branchResolved;
  const branchId = branchResolved;

  if (!canAccessBranch(actor, branchId.toString())) return { error: "That branch is out of your scope." };

  const period = resolvePeriod(String(formData.get("periodStart") ?? ""), String(formData.get("periodEnd") ?? ""));
  if (!period.ok) return { error: period.error };

  const [vendor, branch] = await Promise.all([
    prisma.vendor.findFirst({ where: { id: vendorId, status: "active" } }),
    prisma.branch.findUnique({ where: { id: branchId } }),
  ]);
  if (!vendor) return { error: "Vendor not found or inactive." };
  if (!branch) return { error: "Branch not found." };

  let newId: bigint | undefined;
  let clashError: string | undefined;
  await prisma.$transaction(async (tx) => {
    // One settlement per period: block any overlap with an existing settlement
    // for this vendor + branch. Deleted (cancelled) settlements no longer exist,
    // so a cancelled period can be re-raised. Checked inside the transaction so
    // two concurrent submits can't both pass.
    const clash = await overlappingSettlement(tx, vendorId, branchId, period.period);
    if (clash) {
      clashError =
        `A settlement for this vendor already covers ` +
        `${clash.periodStart.toISOString().slice(0, 10)} → ${clash.periodEnd.toISOString().slice(0, 10)} ` +
        `(${settlementStatusLabel(clash.status)}). Overlapping periods aren't allowed — ` +
        `delete that draft first if it was raised by mistake.`;
      return;
    }

    const totals = await settlementTotals(tx, branchId, period.period);
    const created = await tx.vendorSettlement.create({
      data: {
        vendorId,
        branchId,
        periodStart: period.period.start,
        periodEnd: period.period.end,
        mealCount: totals.mealCount,
        grossAmount: totals.grossAmount,
        status: "draft",
      },
    });
    newId = created.id;
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "settlement.generate",
        entity: "vendor_settlement",
        entityId: created.id,
        after: {
          vendorId: vendorId.toString(),
          branchId: branchId.toString(),
          periodStart: period.period.start.toISOString().slice(0, 10),
          periodEnd: period.period.end.toISOString().slice(0, 10),
          mealCount: totals.mealCount,
          grossAmount: totals.grossAmount.toFixed(2),
        },
      },
      tx,
    );
  });
  if (clashError) return { error: clashError };

  revalidatePath("/settlements");
  redirect(`/settlements/${newId!}?flash=created`);
}

async function loadScopedSettlement(actor: Actor, id: bigint) {
  const s = await prisma.vendorSettlement.findUnique({ where: { id } });
  if (!s) return null;
  if (!canAccessBranch(actor, s.branchId.toString())) return null;
  return s;
}

export async function recomputeSettlementAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("settlements.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const s = await loadScopedSettlement(actor, id);
  if (!s || s.status !== "draft") return; // only drafts recompute; approved/paid are frozen

  const toExclusive = new Date(s.periodEnd.getFullYear(), s.periodEnd.getMonth(), s.periodEnd.getDate() + 1);
  await prisma.$transaction(async (tx) => {
    const totals = await settlementTotals(tx, s.branchId, { start: s.periodStart, end: s.periodEnd, toExclusive });
    await tx.vendorSettlement.update({
      where: { id },
      data: { mealCount: totals.mealCount, grossAmount: totals.grossAmount },
    });
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "settlement.recompute",
        entity: "vendor_settlement",
        entityId: id,
        before: { mealCount: s.mealCount, grossAmount: s.grossAmount.toFixed(2) },
        after: { mealCount: totals.mealCount, grossAmount: totals.grossAmount.toFixed(2) },
      },
      tx,
    );
  });

  revalidatePath(`/settlements/${id}`);
  revalidatePath("/settlements");
}

const TRANSITIONS: Record<string, SettlementStatus> = { approve: "approved", pay: "paid" };

export async function setSettlementStatusAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("settlements.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const next = TRANSITIONS[String(formData.get("transition") ?? "")];
  if (!next) return;

  const s = await loadScopedSettlement(actor, id);
  if (!s) return;
  // Enforce the lifecycle: draft → approved → paid (no skips, no reversals here).
  const ok = (next === "approved" && s.status === "draft") || (next === "paid" && s.status === "approved");
  if (!ok) return;

  await prisma.$transaction(async (tx) => {
    await tx.vendorSettlement.update({ where: { id }, data: { status: next } });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: `settlement.${next}`, entity: "vendor_settlement", entityId: id, before: { status: s.status }, after: { status: next } },
      tx,
    );
  });

  revalidatePath(`/settlements/${id}`);
  revalidatePath("/settlements");
}

export async function deleteSettlementAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("settlements.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const s = await loadScopedSettlement(actor, id);
  if (!s || s.status !== "draft") return; // only drafts can be deleted

  await prisma.$transaction(async (tx) => {
    await tx.vendorSettlement.delete({ where: { id } });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "settlement.delete", entity: "vendor_settlement", entityId: id, before: { vendorId: s.vendorId.toString(), grossAmount: s.grossAmount.toFixed(2), status: s.status } },
      tx,
    );
  });

  revalidatePath("/settlements");
  redirect("/settlements?flash=deleted");
}
