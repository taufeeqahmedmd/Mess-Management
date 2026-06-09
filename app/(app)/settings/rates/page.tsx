import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { PL } from "@/components/reports/breakdown-table";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { RatesMatrix } from "./rates-matrix";
import { CounterRateForm } from "./counter-rate-form";
import { removeCounterRateAction } from "./counter-rate-actions";

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
      include: { mealType: true, category: true, counter: true },
      orderBy: [{ mealType: { startTime: "asc" } }, { category: { name: "asc" } }],
    }),
  ]);

  const rateMap: Record<string, { rate: string; vendor: string }> = {};
  for (const r of defaults) {
    rateMap[`${r.mealTypeId}:${r.categoryId}`] = { rate: r.rate.toFixed(2), vendor: r.vendorRate.toFixed(2) };
  }

  // mealId → [counterId] (which counters serve each meal).
  const mealCounters: Record<string, string[]> = {};
  for (const cm of counterMeals) {
    (mealCounters[cm.mealTypeId.toString()] ??= []).push(cm.counterId.toString());
  }

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
            Override the rate for a meal × category at specific counters. Pick a meal, choose its
            counters (only counters that serve that meal are shown — Select all to apply at once),
            and set the charge and vendor. A counter without an override uses the default above.
          </p>
        </div>

        {canEdit ? (
          <CounterRateForm
            meals={meals.map((m) => ({ id: m.id.toString(), name: m.name }))}
            categories={categories.map((c) => ({ id: c.id.toString(), name: c.name }))}
            counters={counters.map((c) => ({ id: c.id.toString(), name: c.name, code: c.code }))}
            mealCounters={mealCounters}
          />
        ) : null}

        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                <th className="px-4 py-3 font-semibold">Counter</th>
                <th className="px-4 py-3 font-semibold">Meal</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 text-right font-semibold">Charge</th>
                <th className="px-4 py-3 text-right font-semibold">Vendor</th>
                <th className="px-4 py-3 text-right font-semibold">P&amp;L</th>
                {canEdit ? <th className="px-4 py-3 text-right font-semibold">Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {overrides.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-4 py-8 text-center text-ink-2">
                    No per-counter overrides yet. Counters use the default rates.
                  </td>
                </tr>
              ) : (
                overrides.map((o) => (
                  <tr key={o.id.toString()} className="border-t border-line">
                    <td className="px-4 py-3 text-ink">
                      {o.counter?.name}
                      <span className="ml-1 font-mono text-xs text-muted">{o.counter?.code}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{o.mealType.name}</td>
                    <td className="px-4 py-3 text-ink-2">{o.category.name}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink-2">{inr(o.rate)}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink-2">{inr(o.vendorRate)}</td>
                    <td className="px-4 py-3 text-right">
                      <PL value={o.rate.minus(o.vendorRate)} />
                    </td>
                    {canEdit ? (
                      <td className="px-4 py-3 text-right">
                        <ConfirmActionForm
                          action={removeCounterRateAction}
                          className="inline"
                          fields={{ id: o.id.toString() }}
                          confirm={{
                            title: "Remove override",
                            message: `Remove the ${o.mealType.name} / ${o.category.name} rate at ${o.counter?.name}? It will fall back to the default.`,
                            confirmLabel: "Yes, remove",
                            tone: "danger",
                          }}
                          successMessage="Override removed."
                          buttonClassName="rounded-sm px-2.5 py-1 text-xs font-medium text-tomato transition-colors hover:bg-tomato-soft"
                        >
                          Remove
                        </ConfirmActionForm>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
