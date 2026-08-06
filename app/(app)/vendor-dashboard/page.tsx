import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { StatCard } from "@/components/ui/stat-card";
import { DateRangeForm } from "@/components/reports/date-range-form";
import { BreakdownTable } from "@/components/reports/breakdown-table";
import { DayBreakdownTable } from "@/components/reports/day-breakdown-table";
import { ReceiptIcon, CoinsIcon, BankIcon } from "@/components/reports/stat-icons";
import { resolveDateRange, consumptionSummary, usageByMeal, usageByCounter, usageByDay, mealColorMap } from "@/services/reporting";
import { VendorFilters, type CounterFilterOption } from "./vendor-filters";

/** Comma-joined id list from the query string → validated string ids. */
function parseIds(v: string | undefined): string[] {
  return (v ?? "").split(",").filter((s) => /^\d+$/.test(s));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

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
  searchParams: Promise<{ from?: string; to?: string; branches?: string; counters?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "vendorDashboard.view")) redirect("/dashboard");

  const sp = await searchParams;
  // Default window = the full current month (1st → last day), not month-to-date.
  const now = new Date();
  const monthFrom = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  const monthTo = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;
  const range = resolveDateRange(sp.from || monthFrom, sp.to || monthTo, now);
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;

  const broad = actor.isSuperAdmin || can(actor, "counters.manage");
  const [counters, branches] = await Promise.all([
    prisma.counter.findMany({
      where: {
        status: "active",
        ...(branchId ? { branchId } : {}),
        ...(broad ? {} : { operators: { some: { appUserId: BigInt(actor.id) } } }),
      },
      orderBy: { code: "asc" },
    }),
    branchId
      ? Promise.resolve([])
      : prisma.branch.findMany({ where: { status: "active", deletedAt: null }, orderBy: { name: "asc" } }),
  ]);

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

  // Apply the branch / counter multi-select filters on top of the actor's
  // allowed counter set — the query itself stays scoped by `counterIds`.
  const branchSel = parseIds(sp.branches);
  const counterSel = parseIds(sp.counters);
  const branchSet = new Set(branchSel);
  const counterSet = new Set(counterSel);
  let effective = counters;
  if (branchSet.size > 0) effective = effective.filter((c) => branchSet.has(c.branchId.toString()));
  if (counterSet.size > 0) effective = effective.filter((c) => counterSet.has(c.id.toString()));

  const branchName = new Map(branches.map((b) => [b.id.toString(), b.name]));
  const branchOptions = branches.map((b) => ({ value: b.id.toString(), label: b.name }));
  const counterOptions: CounterFilterOption[] = counters.map((c) => ({
    value: c.id.toString(),
    label: branches.length > 1 ? `${c.name} · ${branchName.get(c.branchId.toString()) ?? ""}` : c.name,
    branchId: c.branchId.toString(),
  }));

  const counterIds = effective.map((c) => c.id);
  const f = { branchId, from: range.from, toExclusive: range.toExclusive, counterIds };

  const [summary, byMeal, byCounter, byDay] = await Promise.all([
    consumptionSummary(prisma, f),
    usageByMeal(prisma, f),
    usageByCounter(prisma, f),
    usageByDay(prisma, f),
  ]);
  const mealColors = await mealColorMap(prisma);
  const filtered = branchSel.length > 0 || counterSel.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Vendor Dashboard</h1>
          <p className="mt-1 text-[13px] text-muted">
            {range.fromStr} → {range.toStr} · vendor payable across{" "}
            {filtered
              ? `${effective.length} selected counter${effective.length === 1 ? "" : "s"}`
              : broad
                ? "all counters"
                : `${counters.length} assigned counter${counters.length > 1 ? "s" : ""}`}.
          </p>
        </div>
        <DateRangeForm action="/vendor-dashboard" fromStr={range.fromStr} toStr={range.toStr} active={Boolean(sp.from || sp.to || filtered)}>
          <VendorFilters
            branches={branchOptions}
            counters={counterOptions}
            initialBranches={branchSel}
            initialCounters={counterSel}
          />
        </DateRangeForm>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Meals served" value={summary.count.toLocaleString("en-IN")} hint="taps in selected range" variant="green" icon={<ReceiptIcon />} />
        <StatCard label="Vendor payable" value={inr(summary.cost)} hint="Σ vendor rate × meals" variant="saffron" icon={<CoinsIcon />} />
        <StatCard label="Counters" value={effective.length.toLocaleString("en-IN")} hint={filtered ? "selected counters" : "active counters"} variant="plain" icon={<BankIcon />} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BreakdownTable title="Payable by meal" unit="Meal" rows={byMeal} mode="vendor" accent="saffron" rowDot dotColors={mealColors} />
        <BreakdownTable title="Payable by counter" unit="Counter" rows={byCounter} mode="vendor" accent="green" />
      </section>

      <section>
        <DayBreakdownTable title="Payable by day" data={byDay} />
      </section>
    </div>
  );
}
