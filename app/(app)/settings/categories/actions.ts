"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type CategoryStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export type CategoryFormState = { error?: string };

const categorySchema = z.object({
  code: z.string().trim().min(1, "Code is required.").max(30),
  name: z.string().trim().min(1, "Name is required.").max(80),
  identifierLabel: z.string().trim().min(1, "Identifier label is required.").max(60),
  identifierRegex: z.string().trim().max(120),
  identifierRequired: z.boolean(),
  identifierUnique: z.boolean(),
  status: z.enum(["active", "inactive"]),
});

function parse(formData: FormData) {
  return {
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    identifierLabel: String(formData.get("identifierLabel") ?? "").trim(),
    identifierRegex: String(formData.get("identifierRegex") ?? "").trim(),
    identifierRequired: formData.get("identifierRequired") === "on",
    identifierUnique: formData.get("identifierUnique") === "on",
    status: String(formData.get("status") ?? "active"),
  };
}

function validate(input: ReturnType<typeof parse>): CategoryFormState | null {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  if (input.identifierRegex) {
    try {
      new RegExp(input.identifierRegex);
    } catch {
      return { error: "Identifier regex is not a valid pattern." };
    }
  }
  return null;
}

function dataFrom(input: ReturnType<typeof parse>) {
  return {
    code: input.code,
    name: input.name,
    identifierLabel: input.identifierLabel,
    identifierRegex: input.identifierRegex || null,
    identifierRequired: input.identifierRequired,
    identifierUnique: input.identifierUnique,
    status: input.status as CategoryStatus,
  };
}

export async function createCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const actor = await requirePermission("categories.manage");
  const input = parse(formData);
  const invalid = validate(input);
  if (invalid) return invalid;

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.category.create({ data: dataFrom(input) });
      await writeAudit(
        { appUserId: BigInt(actor.id), action: "category.create", entity: "category", entityId: created.id, after: dataFrom(input) },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A category with that code or name already exists." };
    }
    throw e;
  }

  revalidatePath("/settings/categories");
  redirect("/settings/categories?flash=created");
}

export async function updateCategoryAction(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const actor = await requirePermission("categories.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const input = parse(formData);
  const invalid = validate(input);
  if (invalid) return invalid;

  const before = await prisma.category.findUnique({ where: { id } });
  if (!before) return { error: "Category not found." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.category.update({ where: { id }, data: dataFrom(input) });
      await writeAudit(
        {
          appUserId: BigInt(actor.id),
          action: "category.update",
          entity: "category",
          entityId: id,
          before: { code: before.code, name: before.name, status: before.status },
          after: dataFrom(input),
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A category with that code or name already exists." };
    }
    throw e;
  }

  revalidatePath("/settings/categories");
  redirect("/settings/categories?flash=updated");
}

export async function setCategoryStatusAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("categories.manage");
  const id = BigInt(String(formData.get("id") ?? "0"));
  const status: CategoryStatus =
    String(formData.get("status")) === "inactive" ? "inactive" : "active";

  const before = await prisma.category.findUnique({ where: { id } });
  if (!before) return;

  await prisma.$transaction(async (tx) => {
    await tx.category.update({ where: { id }, data: { status } });
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "category.status",
        entity: "category",
        entityId: id,
        before: { status: before.status },
        after: { status },
      },
      tx,
    );
  });

  revalidatePath("/settings/categories");
}
