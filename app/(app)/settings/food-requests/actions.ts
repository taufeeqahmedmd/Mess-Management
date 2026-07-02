"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { DEFAULT_APPROVAL_CONFIG } from "@/services/food-request";

export type ApprovalFormState = { error?: string; success?: boolean };

/** Save the single-step food-request approval config (settings.food_request_approval). */
export async function saveFoodRequestApprovalAction(
  _prev: ApprovalFormState,
  formData: FormData,
): Promise<ApprovalFormState> {
  const actor = await requirePermission("settings.manage");

  const enabled = formData.get("enabled") === "on";
  const thresholdRaw = String(formData.get("autoApproveBelow") ?? "").trim();

  let autoApproveBelow: number | null = null;
  if (thresholdRaw) {
    const n = Number(thresholdRaw);
    if (!Number.isFinite(n) || n < 0) return { error: "Auto-approve threshold must be a positive amount." };
    autoApproveBelow = n;
  }

  const value = {
    enabled,
    autoApproveBelow,
    approverPermission: DEFAULT_APPROVAL_CONFIG.approverPermission,
  };

  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { settingKey: "food_request_approval" },
      update: { value },
      create: { settingKey: "food_request_approval", value },
    });
    await writeAudit(
      { appUserId: BigInt(actor.id), action: "setting.update", entity: "setting", after: { key: "food_request_approval", ...value } },
      tx,
    );
  });

  revalidatePath("/settings/food-requests");
  return { success: true };
}
