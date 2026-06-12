import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConsumptionForm, type ConsumptionRow } from "./consumption-form";

export default async function ConsumptionPage() {
  const actor = await requireActor();
  if (!can(actor, "categories.manage")) redirect("/dashboard");

  const categories = await prisma.category.findMany({
    where: { status: "active" },
    orderBy: { name: "asc" },
    include: { settings: { where: { status: "active" }, take: 1 } },
  });

  const rows: ConsumptionRow[] = categories.map((c) => {
    const s = c.settings[0];
    const models = (s?.models ?? []).filter(
      (m): m is "wallet" | "coupon" => m === "wallet" || m === "coupon",
    );
    return {
      id: c.id.toString(),
      name: c.name,
      models: models.length ? models : ["wallet"],
      duplicateWindow: s?.duplicateWindow ?? 0,
      restrictMealSession: s?.restrictMealSession ?? false,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[680px] text-[13px] text-muted">
        How each category&rsquo;s taps resolve: <b className="text-ink">Wallet</b> deducts money,{" "}
        <b className="text-ink">Coupon</b> deducts a per-meal count. Set the duplicate-tap window and
        once-per-meal-session rule per category.
      </p>

      <ConsumptionForm rows={rows} />
    </div>
  );
}
