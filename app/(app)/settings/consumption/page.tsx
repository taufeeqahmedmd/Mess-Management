import Link from "next/link";
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
    return {
      id: c.id.toString(),
      name: c.name,
      model: s?.model === "coupon" ? "coupon" : "wallet",
      duplicateWindow: s?.duplicateWindow ?? 0,
      restrictMealSession: s?.restrictMealSession ?? false,
    };
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-5 sm:p-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/settings" className="hover:text-gold-deep">Configurations</Link> / Consumption Settings
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">Consumption Settings</h1>
        <p className="mt-1 max-w-prose text-sm text-ink-2">
          How each category&rsquo;s taps resolve: <span className="font-medium">Wallet</span> deducts
          money, <span className="font-medium">Coupon</span> deducts a per-meal count. Set the
          duplicate-tap window and once-per-meal-session rule per category.
        </p>
      </div>

      <ConsumptionForm rows={rows} />
    </div>
  );
}
