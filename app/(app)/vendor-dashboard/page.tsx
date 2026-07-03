import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { StatCard } from "@/components/ui/stat-card";
import { DateRangeForm } from "@/components/reports/date-range-form";
import { BreakdownTable } from "@/components/reports/breakdown-table";
import { ReceiptIcon, CoinsIcon, BankIcon } from "@/components/reports/stat-icons";
import { resolveDateRange, consumptionSummary, usageByMeal, usageByCounter, mealColorMap } from "@/services/reporting";

/**
 * Vendor Dashboard (plan.md §7 #9) — caterer-facing view of the vendor payable
 * (Σ redemption.vendorAmount) per meal and per counter. Scoped to the operator's
 * assigned counters; admins (counters.manage) / Super Admin see all in-branch
 * counters. How the meal was consumed is irrelevant here — the caterer
 * served it regardless (coupon tap or food-request delivery).
 */
export default async function VendorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "vendorDashboard.view")) redirect("/dashboard");

  const sp = await searchParams;
  const range = resolveDateRange(sp.from, sp.to, new Date());
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;

  const broad = actor.isSuperAdmin || can(actor, "counters.manage");
  const counters = await prisma.counter.findMany({
    where: {
      status: "active",
      ...(branchId ? { branchId } : {}),
      ...(broad ? {} : { operators: { some: { appUserId: BigInt(actor.id) } } }),
    },
    orderBy: { code: "asc" },
  });

  if (counters.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 py-6 sm:px-7">
        <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Vendor Dashboard</h1>
        <div className="rounded-md border border-line bg-surface-2 p-6 text-sm text-ink-2">
          You aren&rsquo;t assigned to any active counter, so there&rsquo;s nothing to show. Ask an
          administrator to assign you under Settings → Counters.
        </div>
      </div>
    );
  }

  const counterIds = counters.map((c) => c.id);
  const f = { branchId, from: range.from, toExclusive: range.toExclusive, counterIds };

  const [summary, byMeal, byCounter] = await Promise.all([
    consumptionSummary(prisma, f),
    usageByMeal(prisma, f),
    usageByCounter(prisma, f),
  ]);
  const mealColors = await mealColorMap(prisma);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Vendor Dashboard</h1>
          <p className="mt-1 text-[13px] text-muted">
            {range.fromStr} → {range.toStr} · vendor payable across{" "}
            {broad ? "all counters" : `${counters.length} assigned counter${counters.length > 1 ? "s" : ""}`}.
          </p>
        </div>
        <DateRangeForm action="/vendor-dashboard" fromStr={range.fromStr} toStr={range.toStr} active={Boolean(sp.from || sp.to)} />
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Meals served" value={summary.count.toLocaleString("en-IN")} hint="taps in selected range" variant="green" icon={<ReceiptIcon />} />
        <StatCard label="Vendor payable" value={inr(summary.cost)} hint="Σ vendor rate × meals" variant="saffron" icon={<CoinsIcon />} />
        <StatCard label="Counters" value={counters.length.toLocaleString("en-IN")} hint="active counters" variant="plain" icon={<BankIcon />} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BreakdownTable title="Payable by meal" unit="Meal" rows={byMeal} mode="vendor" accent="saffron" rowDot dotColors={mealColors} />
        <BreakdownTable title="Payable by counter" unit="Counter" rows={byCounter} mode="vendor" accent="green" />
      </section>
    </div>
  );
}
