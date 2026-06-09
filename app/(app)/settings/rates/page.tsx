import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { RatesMatrix } from "./rates-matrix";
import { CounterRatesEditor, type InitialRow } from "./counter-rates-editor";

export default async function RatesPage() {
  const actor = await requireActor();
  if (!can(actor, "rates.manage")) redirect("/dashboard");
  const canEdit = can(actor, "rates.manage") && can(actor, "vendorRates.manage");

  const branch = actor.branchId
    ? await prisma.branch.findUnique({ where: { id: BigInt(actor.branchId) } })
    : await prisma.branch.findFirst({ orderBy: { id: "asc" } });
  if (!branch) redirect("/dashboard");

  const [meals, categories, defaults, counters, counterMeals, overrides] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true }, orderBy: { startTime: "asc" } }),
    prisma.category.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    // Branch defaults only (counter_id NULL) — counter overrides must not leak in.
    prisma.mealRate.findMany({ where: { branchId: branch.id, counterId: null, validTo: null } }),
    prisma.counter.findMany({
      where: { branchId: branch.id, status: "active", deletedAt: null },
      orderBy: { code: "asc" },
    }),
    prisma.counterMeal.findMany({
      where: { active: true, counter: { branchId: branch.id } },
      select: { mealTypeId: true, counterId: true },
    }),
    prisma.mealRate.findMany({
      where: { branchId: branch.id, counterId: { not: null }, validTo: null },
    }),
  ]);

  const rateMap: Record<string, { rate: string; vendor: string }> = {};
  for (const r of defaults) {
    rateMap[`${r.mealTypeId}:${r.categoryId}`] = { rate: r.rate.toFixed(2), vendor: r.vendorRate.toFixed(2) };
  }

  // counterId → [mealId] (only the meals each counter serves).
  const mealsByCounter: Record<string, string[]> = {};
  for (const cm of counterMeals) {
    (mealsByCounter[cm.counterId.toString()] ??= []).push(cm.mealTypeId.toString());
  }

  // Existing counter overrides → one editor row per (counter, meal) with category cells.
  const rowMap = new Map<string, InitialRow>();
  for (const o of overrides) {
    const counterId = o.counterId!.toString();
    const mealId = o.mealTypeId.toString();
    const key = `${counterId}:${mealId}`;
    let row = rowMap.get(key);
    if (!row) {
      row = { counterId, mealId, cells: {} };
      rowMap.set(key, row);
    }
    row.cells[o.categoryId.toString()] = { charge: o.rate.toFixed(2), vendor: o.vendorRate.toFixed(2) };
  }
  const initialRows = [...rowMap.values()];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Default rates</h2>
          <p className="mt-1 text-sm text-ink-2">
            Charge (sale) and vendor (cost) per meal × category for{" "}
            <span className="font-medium text-ink">{branch.name}</span>. These apply at any counter
            without a specific rate below. Profit/Loss = charge − vendor.
          </p>
        </div>

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
      </section>

      <section className="flex flex-col gap-4 border-t border-line pt-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Per-counter rates</h2>
          <p className="mt-1 text-sm text-ink-2">
            Add a row per counter to override its rates. Choose a counter, then a meal it serves, then
            set the charge and vendor per category — add as many rows as you need. A counter without a
            row here uses the default rates above.
          </p>
        </div>

        {canEdit ? (
          <CounterRatesEditor
            branchId={branch.id.toString()}
            counters={counters.map((c) => ({ id: c.id.toString(), name: c.name, code: c.code }))}
            meals={meals.map((m) => ({ id: m.id.toString(), name: m.name }))}
            categories={categories.map((c) => ({ id: c.id.toString(), name: c.name }))}
            mealsByCounter={mealsByCounter}
            initialRows={initialRows}
          />
        ) : (
          <p className="rounded-sm bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
            You need both Rates and Vendor Rates permissions to edit per-counter rates.
          </p>
        )}
      </section>
    </div>
  );
}
