"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

const schema = z.object({
  current: z.string().min(1),
  next: z.string().min(6, "New password must be at least 6 characters."),
  confirm: z.string().min(1),
});

export type ChangePasswordState = { error?: string; success?: boolean };

/** Signed-in staff changes their own password (verifies current; min 6 chars). */
export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const actor = await requireActor();

  const parsed = schema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { current, next, confirm } = parsed.data;
  if (next !== confirm) return { error: "New passwords do not match." };

  const user = await prisma.appUser.findUnique({ where: { id: BigInt(actor.id) } });
  if (!user) return { error: "Account not found." };

  if (!(await bcrypt.compare(current, user.passwordHash))) {
    return { error: "Current password is incorrect." };
  }
  if (await bcrypt.compare(next, user.passwordHash)) {
    return { error: "New password must be different from the current one." };
  }

  const passwordHash = await bcrypt.hash(next, 10);
  await prisma.$transaction(async (tx) => {
    await tx.appUser.update({ where: { id: user.id }, data: { passwordHash } });
    await writeAudit(
      { appUserId: user.id, action: "password.change", entity: "app_user", entityId: user.id },
      tx,
    );
  });

  return { success: true };
}
