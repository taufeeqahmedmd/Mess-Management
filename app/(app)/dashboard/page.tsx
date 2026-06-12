import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { StatCard } from "@/components/ui/stat-card";
import { DateRangeForm } from "@/components/reports/date-range-form";
import { BreakdownTable } from "@/components/reports/breakdown-table";
import { ProfitAreaChart } from "@/components/reports/profit-area-chart";
import { UsersIcon, ReceiptIcon, BagIcon, TrendingUpIcon, WalletIcon, CoinsIcon, ChefHatIcon, BankIcon } from "@/components/reports/stat-icons";
import {
  resolveDateRange,
  consumptionSummary,
  collectionsSummary,
  overallCollections,
  overallVendorCost,
  profitTrend,
  activeCardholderCount,
  usageByCardholderType,
  usageByMeal,
  usageByCounter,
  mealColorMap,
} from "@/services/reporting";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "dashboard.view")) redirect("/counter");

  const sp = await searchParams;
  // Dashboard (and its profit chart) default to the last 7 days; once the user
  // picks a range it's honoured. Other reports keep the month default.
  const now = new Date();
  let fromStr = sp.from;
  let toStr = sp.to;
  if (!fromStr && !toStr) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 6);
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    fromStr = ymd(weekAgo);
    toStr = ymd(today);
  }
  const range = resolveDateRange(fromStr, toStr, now);
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;
  const f = { branchId, from: range.from, toExclusive: range.toExclusive };

  const [cardholders, consumption, collections, overallColl, overallVendor, trend, byCardholderType, byMeal, byCounter] =
    await Promise.all([
      activeCardholderCount(prisma, branchId),
      consumptionSummary(prisma, f),
      collectionsSummary(prisma, f),
      overallCollections(prisma, branchId),
      overallVendorCost(prisma, branchId),
      profitTrend(prisma, f),
      usageByCardholderType(prisma, f),
      usageByMeal(prisma, f),
      usageByCounter(prisma, f),
    ]);
  const mealColors = await mealColorMap(prisma);

  const plPositive = !consumption.pl.isNegative();
  const operatingRevenue = overallColl.minus(overallVendor);
  const orPositive = !operatingRevenue.isNegative();

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Dashboard</h1>
          <p className="mt-1 text-[13px] text-muted">
            {range.fromStr} → {range.toStr} · consumption, collections, and profit.
          </p>
        </div>
        <DateRangeForm action="/dashboard" fromStr={range.fromStr} toStr={range.toStr} />
      </div>

      {/* Row 1: four KPIs + the profit-trend chart, one row on wide screens */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:[grid-template-columns:repeat(4,minmax(0,1fr))_1.55fr]">
        <StatCard label="Cardholders" value={cardholders.toLocaleString("en-IN")} hint="active" variant="saffron" icon={<UsersIcon />} />
        <StatCard label="Sale" value={inr(consumption.sale)} hint="value of meals served" variant="saffron" icon={<ReceiptIcon />} />
        <StatCard label="Vendor cost" value={inr(consumption.cost)} hint="in selected range" variant="plain" icon={<BagIcon />} />
        <StatCard
          label={plPositive ? "Profit" : "Loss"}
          value={`${plPositive ? "" : "−"}${inr(consumption.pl.abs())}`}
          hint="sale − vendor cost"
          variant={plPositive ? "green" : "plain"}
          icon={<TrendingUpIcon />}
        />
        <div className="sm:col-span-2 xl:col-span-1">
          <ProfitAreaChart points={trend} rangeLabel={`${range.fromStr} → ${range.toStr}`} />
        </div>
      </section>

      {/* Row 2: collections + operating revenue */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collections" value={inr(collections.amount)} hint={`${collections.count} recharges in range`} variant="navy" icon={<WalletIcon />} />
        <StatCard label="Overall collection" value={inr(overallColl)} hint="all time" variant="navy" icon={<CoinsIcon />} />
        <StatCard label="Payable to caterer" value={inr(overallVendor)} hint="all time" variant="plain" icon={<ChefHatIcon />} />
        <StatCard
          label="Operating revenue"
          value={`${orPositive ? "" : "−"}${inr(operatingRevenue.abs())}`}
          hint="overall collection − caterer"
          variant={orPositive ? "green" : "plain"}
          icon={<BankIcon />}
        />
      </section>

      {/* Row 3: breakdown tables */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BreakdownTable title="Usage by category" unit="Category" rows={byCardholderType} accent="saffron" />
        <BreakdownTable title="Usage by meal" unit="Meal" rows={byMeal} accent="green" rowDot dotColors={mealColors} />
      </section>

      <BreakdownTable title="Usage by counter" unit="Counter" rows={byCounter} accent="navy" />
    </div>
  );
}
