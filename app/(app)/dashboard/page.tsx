import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { StatCard } from "@/components/ui/stat-card";
import { CountUp } from "@/components/ui/count-up";
import { DateRangeForm } from "@/components/reports/date-range-form";
import { BreakdownTableInner } from "@/components/reports/breakdown-table";
import { UsageBreakdownTabs } from "@/components/reports/usage-breakdown-tabs";
import { ProfitAreaChart } from "@/components/reports/profit-area-chart";
import { UsersIcon, ReceiptIcon, BagIcon, TrendingUpIcon, BanknoteIcon, CoinStackIcon, ChefHatIcon, BankIcon } from "@/components/reports/stat-icons";
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
  // Dashboard defaults to "this month" (first of month → today); once the user
  // picks a range it's honoured. resolveDateRange supplies the month default.
  const now = new Date();
  const range = resolveDateRange(sp.from, sp.to, now);
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

      {/* One grid drives both layouts via `order`:
          • mobile  → chart, KPIs (2×2), collection cards, usage tabs
          • desktop → KPIs row, collection cards row, then [usage tabs | chart] */}
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
        {/* Profit trend — first on mobile, right column on desktop */}
        <div className="order-1 xl:order-4">
          <ProfitAreaChart points={trend} rangeLabel={`${range.fromStr} → ${range.toStr}`} />
        </div>

        {/* Consumption KPIs — 2×2 on mobile, 4-across on desktop */}
        <section className="order-2 grid grid-cols-2 gap-4 xl:order-1 xl:col-span-2 xl:grid-cols-4">
          <StatCard label="Cardholders" value={<CountUp value={cardholders} />} hint="active" variant="saffron" icon={<UsersIcon />} />
          <StatCard label="Sale" value={<CountUp value={consumption.sale.toNumber()} prefix="₹" decimals={2} />} hint="value of meals served" variant="saffron" icon={<ReceiptIcon />} />
          <StatCard label="Vendor cost" value={<CountUp value={consumption.cost.toNumber()} prefix="₹" decimals={2} />} hint="in selected range" variant="plain" icon={<BagIcon />} />
          <StatCard
            label={plPositive ? "Profit" : "Loss"}
            value={<CountUp value={consumption.pl.abs().toNumber()} prefix={`${plPositive ? "" : "−"}₹`} decimals={2} />}
            hint="sale − vendor cost"
            variant={plPositive ? "green" : "plain"}
            icon={<TrendingUpIcon />}
          />
        </section>

        {/* Collections + operating revenue — single column on mobile (unchanged) */}
        <section className="order-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:order-2 xl:col-span-2 xl:grid-cols-4">
          <StatCard label="Collections" value={<CountUp value={collections.amount.toNumber()} prefix="₹" decimals={2} />} hint={`${collections.count} recharges in range`} variant="navy" icon={<BanknoteIcon />} />
          <StatCard label="Overall collection" value={<CountUp value={overallColl.toNumber()} prefix="₹" decimals={2} />} hint="all time" variant="navy" icon={<CoinStackIcon />} />
          <StatCard label="Payable to caterer" value={<CountUp value={overallVendor.toNumber()} prefix="₹" decimals={2} />} hint="all time" variant="plain" icon={<ChefHatIcon />} />
          <StatCard
            label="Operating revenue"
            value={<CountUp value={operatingRevenue.abs().toNumber()} prefix={`${orPositive ? "" : "−"}₹`} decimals={2} />}
            hint="overall collection − caterer"
            variant={orPositive ? "green" : "plain"}
            icon={<BankIcon />}
          />
        </section>

        {/* Usage breakdown tabs — left column on desktop */}
        <UsageBreakdownTabs
          className="order-4 xl:order-3"
          taps={consumption.count}
          sale={consumption.sale.toNumber()}
          tabs={[
            { id: "category", label: "By category", content: <BreakdownTableInner unit="Category" rows={byCardholderType} /> },
            { id: "meal", label: "By meal", content: <BreakdownTableInner unit="Meal" rows={byMeal} rowDot dotColors={mealColors} /> },
            { id: "counter", label: "By counter", content: <BreakdownTableInner unit="Counter" rows={byCounter} /> },
          ]}
        />
      </div>
    </div>
  );
}
