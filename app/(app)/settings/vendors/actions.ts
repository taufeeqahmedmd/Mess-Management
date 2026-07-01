"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type BranchStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export type VendorFormState = { error?: string };

const vendorSchema = z.object({
  code: z.string().trim().min(1, "Code is required.").max(30),
  name: z.string().trim().min(1, "Name is required.").max(150),
  gstin: z.string().trim().max(20),
  phone: z.string().trim().max(20),
  email: z.string().trim().max(150),
  address: z.string().trim().max(500),
  bankName: z.string().trim().max(150),
  bankAccountName: z.string().trim().max(150),
  bankAccountNumber: z.string().trim().max(40),
  bankIfsc: z.string().trim().max(20),
  notes: z.string().trim().max(1000),
  status: z.enum(["active", "inactive"]),
});

type VendorInput = z.infer<typeof vendorSchema>;

function parseVendor(formData: FormData) {
  const g = (k: string) => String(formData.get(k) ?? "").trim();
  return {
    code: g("code"),
    name: g("name"),
    gstin: g("gstin"),
    phone: g("phone"),
    email: g("email"),
    address: g("address"),
    bankName: g("bankName"),
    bankAccountName: g("bankAccountName"),
    bankAccountNumber: g("bankAccountNumber"),
    bankIfsc: g("bankIfsc"),
    notes: g("notes"),
    status: g("status") || "active",
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Map validated input → Prisma columns (empty strings become NULL). */
function vendorData(d: VendorInput) {
  return {
    code: d.code,
    name: d.name,
    gstin: d.gstin || null,
    phone: d.phone || null,
    email: d.email || null,
    address: d.address || null,
    bankName: d.bankName || null,
    bankAccountName: d.bankAccountName || null,
    bankAccountNumber: d.bankAccountNumber || null,
    bankIfsc: d.bankIfsc || null,
    notes: d.notes || null,
    status: d.status as BranchStatus,
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
  if (d.email && !EMAIL.test(d.email)) return { error: "Email is not valid." };

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.vendor.create({ data: vendorData(d) });
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "vendor.create", entity: "vendor", entityId: created.id, after: { code: d.code, name: d.name } },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A vendor with that code already exists." };
    }
    throw e;
  }

  revalidatePath("/settings/vendors");
  redirect("/settings/vendors?flash=created");
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
  if (d.email && !EMAIL.test(d.email)) return { error: "Email is not valid." };

  const before = await prisma.vendor.findUnique({ where: { id } });
  if (!before) return { error: "Vendor not found." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.vendor.update({ where: { id }, data: vendorData(d) });
      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "vendor.update",
          entity: "vendor",
          entityId: id,
          before: { code: before.code, name: before.name, status: before.status },
          after: { code: d.code, name: d.name, status: d.status },
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

  revalidatePath("/settings/vendors");
  redirect("/settings/vendors?flash=updated");
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

  revalidatePath("/settings/vendors");
}
