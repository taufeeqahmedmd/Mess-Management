import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { StatCard } from "@/components/ui/stat-card";
import { DateRangeForm } from "@/components/reports/date-range-form";
import { BreakdownTable } from "@/components/reports/breakdown-table";
import { ProfitChart } from "@/components/reports/profit-chart";
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

  const plPositive = !consumption.pl.isNegative();
  const operatingRevenue = overallColl.minus(overallVendor);
  const orPositive = !operatingRevenue.isNegative();

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-2">
            {range.fromStr} → {range.toStr} · consumption, collections, and profit.
          </p>
        </div>
        <DateRangeForm action="/dashboard" fromStr={range.fromStr} toStr={range.toStr} />
      </div>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* 8 KPI cards — 4 per row × 2 */}
        <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4 lg:col-span-8">
          <StatCard label="Cardholders" value={cardholders.toLocaleString("en-IN")} hint="active" icon={<UsersIcon />} accent="ink" />
          <StatCard label="Sale" value={inr(consumption.sale)} hint="value of meals served" variant="gold" icon={<ReceiptIcon />} />
          <StatCard label="Vendor cost" value={inr(consumption.cost)} hint="in selected range" icon={<BagIcon />} accent="tomato" />
          <StatCard
            label={plPositive ? "Profit" : "Loss"}
            value={`${plPositive ? "" : "−"}${inr(consumption.pl.abs())}`}
            hint="sale − vendor cost"
            variant={plPositive ? "sage" : "plain"}
            icon={<TrendingUpIcon />}
            accent={plPositive ? "sage" : "tomato"}
          />
          <StatCard label="Collections" value={inr(collections.amount)} hint={`${collections.count} recharges in range`} icon={<WalletIcon />} accent="gold" />
          <StatCard label="Overall collection" value={inr(overallColl)} hint="all time" icon={<CoinsIcon />} accent="gold" />
          <StatCard label="Payable to caterer" value={inr(overallVendor)} hint="all time" icon={<ChefHatIcon />} accent="tomato" />
          <StatCard
            label="Operating revenue"
            value={`${orPositive ? "" : "−"}${inr(operatingRevenue.abs())}`}
            hint="overall collection − caterer"
            variant={orPositive ? "sage" : "plain"}
            icon={<BankIcon />}
            accent={orPositive ? "sage" : "tomato"}
          />
        </div>

        {/* Profit chart — honours the date filter (defaults to current month) */}
        <div className="lg:col-span-4">
          <ProfitChart points={trend} rangeLabel={`${range.fromStr} → ${range.toStr}`} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <BreakdownTable title="Usage by category" unit="Identifier" rows={byCardholderType} />
        <BreakdownTable title="Usage by meal" unit="Meal" rows={byMeal} />
      </section>

      <BreakdownTable title="Usage by counter" unit="Counter" rows={byCounter} />
    </div>
  );
}
