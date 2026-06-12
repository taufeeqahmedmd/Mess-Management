"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export type ProfileState = { error?: string; success?: boolean };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Self-service update of the signed-in staff member's own display name + email.
 * No special permission required beyond an authenticated session (you can only
 * edit yourself — the id comes from the session, never the form). Mobile is the
 * login handle and is changed by an administrator, not here.
 */
export async function updateProfileAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const actor = await requireActor();

  const name = String(formData.get("name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  if (!name) return { error: "Display name is required." };
  if (name.length > 150) return { error: "Display name is too long." };
  if (emailRaw && !EMAIL.test(emailRaw)) return { error: "Email is not valid." };
  const email = emailRaw || null;

  const id = BigInt(actor.id);
  const before = await prisma.appUser.findUnique({ where: { id }, select: { name: true, email: true } });
  if (!before) return { error: "Account not found." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.appUser.update({ where: { id }, data: { name, email } });
      await writeAudit(
        {
          appUserId: id,
          action: "profile.update",
          entity: "app_user",
          entityId: id,
          before: { name: before.name, email: before.email },
          after: { name, email },
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "That email is already in use by another account." };
    }
    throw e;
  }

  revalidatePath("/profile");
  return { success: true };
}
