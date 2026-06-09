import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { StatCard } from "@/components/ui/stat-card";
import { DateRangeForm } from "@/components/reports/date-range-form";
import { BreakdownTable } from "@/components/reports/breakdown-table";
import {
  resolveDateRange,
  consumptionSummary,
  collectionsSummary,
  activeCardholderCount,
  usageByCategory,
  usageByMeal,
  usageByCounter,
} from "@/services/reporting";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "dashboard.view")) redirect("/counter");

  const sp = await searchParams;
  const range = resolveDateRange(sp.from, sp.to, new Date());
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;
  const f = { branchId, from: range.from, toExclusive: range.toExclusive };

  const [cardholders, consumption, collections, byCategory, byMeal, byCounter] = await Promise.all([
    activeCardholderCount(prisma, branchId),
    consumptionSummary(prisma, f),
    collectionsSummary(prisma, f),
    usageByCategory(prisma, f),
    usageByMeal(prisma, f),
    usageByCounter(prisma, f),
  ]);

  const plPositive = !consumption.pl.isNegative();

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-2">
            {range.fromStr} → {range.toStr} · consumption, collections, and profit / loss.
          </p>
        </div>
        <DateRangeForm action="/dashboard" fromStr={range.fromStr} toStr={range.toStr} />
      </div>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Cardholders" value={cardholders.toLocaleString("en-IN")} variant="plain" />
        <StatCard
          label="Taps"
          value={consumption.count.toLocaleString("en-IN")}
          hint="meals served in range"
          variant="sage"
        />
        <StatCard label="Sale" value={inr(consumption.sale)} hint="value of meals served" variant="gold" />
        <StatCard label="Collections" value={inr(collections.amount)} hint={`${collections.count} recharges`} variant="plain" />
        <StatCard label="Vendor cost" value={inr(consumption.cost)} hint="payable to caterer" variant="plain" />
        <StatCard
          label={plPositive ? "Profit" : "Loss"}
          value={`${plPositive ? "+" : "−"}${inr(consumption.pl.abs())}`}
          hint="sale − vendor cost"
          variant={plPositive ? "sage" : "plain"}
        />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <BreakdownTable title="Usage by category" unit="Category" rows={byCategory} />
        <BreakdownTable title="Usage by meal" unit="Meal" rows={byMeal} />
      </section>

      <BreakdownTable title="Usage by counter" unit="Counter" rows={byCounter} />
    </div>
  );
}
