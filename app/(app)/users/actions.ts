"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type UserStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { emitNotification } from "@/lib/notifications/notify";
import { ensureCouponBalances, activeMealTypeIds } from "@/services/coupon-balance";
import type { Actor } from "@/lib/rbac";

export type UserFormState = { error?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\d{10}$/;

const userSchema = z.object({
  code: z.string().trim().max(40).regex(/^\S*$/, "ID cannot contain spaces."),
  fullName: z.string().trim().min(1, "Name is required.").max(150),
  categoryId: z.string().min(1, "Category is required."),
  departmentId: z.string(),
  branchId: z.string(),
  phone: z.string().trim().max(20),
  email: z.string().trim().max(150),
  cardExpiryDate: z.string(),
  photoUrl: z.string().trim().max(255),
  status: z.enum(["active", "suspended", "inactive"]),
});

function parse(formData: FormData) {
  return {
    code: String(formData.get("code") ?? "").trim(),
    fullName: String(formData.get("fullName") ?? "").trim(),
    categoryId: String(formData.get("categoryId") ?? "").trim(),
    departmentId: String(formData.get("departmentId") ?? "").trim(),
    branchId: String(formData.get("branchId") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    cardExpiryDate: String(formData.get("cardExpiryDate") ?? "").trim(),
    photoUrl: String(formData.get("photoUrl") ?? "").trim(),
    status: String(formData.get("status") ?? "active"),
  };
}

type Input = ReturnType<typeof parse>;

async function validateCommon(
  actor: Actor,
  input: Input,
  codeRequired: boolean,
): Promise<{ error: string } | { categoryId: bigint; branchId: bigint; departmentId: bigint | null; cardExpiryDate: Date | null; code: string }> {
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const category = await prisma.category.findUnique({ where: { id: BigInt(input.categoryId) } });
  if (!category) return { error: "Invalid category." };

  // Contact (phone & email): required per-category, but only when CREATING
  // (codeRequired = create). Editing stays lenient so legacy records still save.
  // Format is always validated when a value is present.
  const contactRequired = codeRequired && category.contactRequired;
  // Phone format is enforced on CREATE only. Editing stays lenient: a legacy
  // non-10-digit phone (older records had no format rule) must still save.
  if (input.phone) {
    if (codeRequired && !PHONE.test(input.phone)) return { error: "Enter a valid 10-digit mobile number." };
  } else if (contactRequired) {
    return { error: "Phone is required." };
  }
  if (input.email) {
    if (!EMAIL.test(input.email)) return { error: "Email is not valid." };
  } else if (contactRequired) {
    return { error: "Email is required." };
  }

  let code = input.code;
  if (!code) {
    if (category.identifierRequired) return { error: "ID is required." };
    code = `${category.code}-${Date.now()}`; // auto-handle when identifier optional
  } else if (category.identifierRegex) {
    try {
      if (!new RegExp(category.identifierRegex).test(code)) {
        return { error: "ID does not match the required format." };
      }
    } catch {
      /* invalid stored regex — skip */
    }
  }
  if (codeRequired && category.identifierRequired && !code) {
    return { error: "ID is required." };
  }

  const branchId = actor.branchId
    ? BigInt(actor.branchId)
    : input.branchId
      ? BigInt(input.branchId)
      : null;
  if (branchId === null) return { error: "Select a branch." };

  // A department must belong to the resolved branch — never let a forged
  // departmentId attach a cardholder to another branch's department.
  let departmentId: bigint | null = null;
  if (input.departmentId) {
    let depId: bigint;
    try {
      depId = BigInt(input.departmentId);
    } catch {
      return { error: "Invalid department." };
    }
    const dep = await prisma.department.findUnique({ where: { id: depId }, select: { branchId: true } });
    if (!dep || dep.branchId !== branchId) return { error: "Invalid department for this branch." };
    departmentId = depId;
  }

  return {
    code,
    categoryId: category.id,
    branchId,
    departmentId,
    cardExpiryDate: input.cardExpiryDate ? new Date(input.cardExpiryDate) : null,
  };
}

export async function createUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await requirePermission("users.create");
  const input = parse(formData);
  const v = await validateCommon(actor, input, true);
  if ("error" in v) return v;

  const cardUid = String(formData.get("cardUid") ?? "").trim();
  if (!cardUid) return { error: "RFID card UID is required." };

  let createdId: bigint | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          code: v.code,
          fullName: input.fullName,
          phone: input.phone || null,
          email: input.email || null,
          categoryId: v.categoryId,
          departmentId: v.departmentId,
          branchId: v.branchId,
          photoUrl: input.photoUrl || null,
          cardExpiryDate: v.cardExpiryDate,
          status: input.status as UserStatus,
          createdBy: BigInt(actor.id),
        },
      });
      if (cardUid) {
        const card = await tx.rfidCard.create({
          data: { cardUid, userId: user.id, status: "active", issuedAt: new Date() },
        });
        await tx.cardEvent.create({
          data: { cardId: card.id, userId: user.id, type: "issue", newUid: cardUid, appUserId: BigInt(actor.id) },
        });
      }
      // Materialise the cardholder's coupon-balance grid (one count-0 row per
      // active meal) so every meal is represented from day one.
      await ensureCouponBalances(tx, user.id, await activeMealTypeIds(tx));
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "user.create", entity: "user", entityId: user.id, after: { code: v.code, fullName: input.fullName, cardUid: cardUid || null } },
        tx,
      );
      createdId = user.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That ID or card UID is already in use." };
    }
    throw e;
  }

  // Welcome notification (post-commit, best-effort) — Notifications Management
  // decides whether/where it actually goes.
  if (createdId) {
    const fresh = await prisma.user.findUnique({
      where: { id: createdId },
      include: { category: true, branch: true },
    });
    if (fresh) {
      await emitNotification("user.created", {
        vars: { name: fresh.fullName, code: fresh.code, category: fresh.category.name, branch: fresh.branch.name },
        cardholder: { email: fresh.email, phone: fresh.phone, branchId: fresh.branchId },
      });
    }
  }

  revalidatePath("/users");
  redirect("/users?flash=created");
}

export async function updateUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await requirePermission("users.edit");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const input = parse(formData);
  const v = await validateCommon(actor, input, false);
  if ("error" in v) return v;

  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) return { error: "Cardholder not found." };
  if (actor.branchId && before.branchId.toString() !== actor.branchId) {
    return { error: "Out of your branch scope." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          code: input.code || before.code,
          fullName: input.fullName,
          phone: input.phone || null,
          email: input.email || null,
          categoryId: v.categoryId,
          departmentId: v.departmentId,
          branchId: actor.branchId ? before.branchId : v.branchId,
          photoUrl: input.photoUrl || null,
          cardExpiryDate: v.cardExpiryDate,
          status: input.status as UserStatus,
        },
      });
      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "user.update",
          entity: "user",
          entityId: id,
          before: { code: before.code, fullName: before.fullName, status: before.status },
          after: { code: input.code || before.code, fullName: input.fullName, status: input.status },
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That ID is already in use." };
    }
    throw e;
  }

  revalidatePath("/users");
  redirect("/users?flash=updated");
}

export async function setUserStatusAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("users.edit");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const status: UserStatus = String(formData.get("status")) === "suspended" ? "suspended" : "active";

  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) return;
  if (actor.branchId && before.branchId.toString() !== actor.branchId) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { status } });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "user.status", entity: "user", entityId: id, before: { status: before.status }, after: { status } },
      tx,
    );
  });

  revalidatePath("/users");
}
