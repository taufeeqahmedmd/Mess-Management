import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { RatesMatrix } from "./rates-matrix";

export default async function RatesPage() {
  const actor = await requireActor();
  if (!can(actor, "rates.manage")) redirect("/dashboard");
  const canEdit = can(actor, "rates.manage") && can(actor, "vendorRates.manage");

  const branch = actor.branchId
    ? await prisma.branch.findUnique({ where: { id: BigInt(actor.branchId) } })
    : await prisma.branch.findFirst({ orderBy: { id: "asc" } });
  if (!branch) redirect("/dashboard");

  const [meals, categories, rates] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true }, orderBy: { startTime: "asc" } }),
    prisma.category.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    prisma.mealRate.findMany({ where: { branchId: branch.id, validTo: null } }),
  ]);

  const rateMap: Record<string, { rate: string; vendor: string }> = {};
  for (const r of rates) {
    rateMap[`${r.mealTypeId}:${r.categoryId}`] = {
      rate: r.rate.toFixed(2),
      vendor: r.vendorRate.toFixed(2),
    };
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-2">
        Charge (sale) and vendor (cost) price per meal × category for{" "}
        <span className="font-medium text-ink">{branch.name}</span>. Profit/Loss = charge − vendor.
      </p>

      {!canEdit ? (
        <p className="rounded-sm bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
          You need both <span className="font-medium">Rates</span> and{" "}
          <span className="font-medium">Vendor Rates</span> permissions to edit. Viewing only.
        </p>
      ) : null}

      <RatesMatrix
        branchId={branch.id.toString()}
        meals={meals.map((m) => ({ id: m.id.toString(), name: m.name }))}
        categories={categories.map((c) => ({ id: c.id.toString(), name: c.name }))}
        rates={rateMap}
        canEdit={canEdit}
      />
    </div>
  );
}
