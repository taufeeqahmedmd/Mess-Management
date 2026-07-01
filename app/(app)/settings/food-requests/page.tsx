import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { parseApprovalConfig } from "@/services/food-request";
import { ApprovalForm } from "./approval-form";

export default async function FoodRequestSettingsPage() {
  const actor = await requireActor();
  if (!can(actor, "settings.manage")) redirect("/dashboard");

  const setting = await prisma.setting.findUnique({ where: { settingKey: "food_request_approval" } });
  const config = parseApprovalConfig(setting?.value);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-[20px] font-bold text-ink">Approval workflow</h2>
        <p className="mt-1 max-w-[680px] text-[13px] text-muted">
          Configure the optional single-step approval for admin food requests.
        </p>
      </div>
      <ApprovalForm enabled={config.enabled} autoApproveBelow={config.autoApproveBelow} />
    </div>
  );
}
