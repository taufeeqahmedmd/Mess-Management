import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { StatCard } from "@/components/ui/stat-card";
import { DateRangeForm } from "@/components/reports/date-range-form";
import { BreakdownTable } from "@/components/reports/breakdown-table";
import { resolveDateRange, consumptionSummary, usageByMeal, usageByCounter } from "@/services/reporting";

/**
 * Vendor Dashboard (plan.md §7 #9) — caterer-facing view of the vendor payable
 * (Σ redemption.vendorAmount) per meal and per counter. Scoped to the operator's
 * assigned counters; admins (counters.manage) / Super Admin see all in-branch
 * counters. The cardholder's payment method is irrelevant here — the caterer
 * served the meal regardless of wallet vs coupon.
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
      <div className="flex w-full flex-col gap-4 px-5 py-5 sm:px-8 sm:py-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Vendor Dashboard</h1>
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

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Vendor Dashboard</h1>
          <p className="mt-1 text-sm text-ink-2">
            {range.fromStr} → {range.toStr} · vendor payable across{" "}
            {broad ? "all counters" : `${counters.length} assigned counter${counters.length > 1 ? "s" : ""}`}.
          </p>
        </div>
        <DateRangeForm action="/vendor-dashboard" fromStr={range.fromStr} toStr={range.toStr} />
      </div>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StatCard label="Meals served" value={summary.count.toLocaleString("en-IN")} variant="sage" />
        <StatCard label="Vendor payable" value={inr(summary.cost)} hint="Σ vendor rate × meals" variant="gold" />
        <StatCard label="Counters" value={counters.length.toLocaleString("en-IN")} variant="plain" />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <BreakdownTable title="Payable by meal" unit="Meal" rows={byMeal} mode="vendor" />
        <BreakdownTable title="Payable by counter" unit="Counter" rows={byCounter} mode="vendor" />
      </section>
    </div>
  );
}
