import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { type Actor } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { formatDateTimeInZone } from "@/lib/time";
import { StatCard } from "@/components/ui/stat-card";
import { DateRangeForm } from "@/components/reports/date-range-form";
import { PL } from "@/components/reports/breakdown-table";
import { DonutChart } from "@/components/reports/donut-chart";
import { SaleVendorBarChart } from "@/components/reports/sale-vendor-bar-chart";
import { Pager } from "@/components/ui/pager";
import { ReceiptIcon, CoinsIcon, BagIcon, TrendingUpIcon } from "@/components/reports/stat-icons";
import { BTN_GHOST, PANEL, TH, TD, clampPageSize } from "@/components/ui/controls";
import { DownloadGlyph } from "@/components/ui/glyphs";
import {
  resolveDateRange,
  redemptionWhere,
  consumptionSummary,
  usageByMeal,
  salesVendorTrend,
  mealColorMap,
  type ConsumptionFilter,
} from "@/services/reporting";

export type ConsumptionParams = {
  from?: string; to?: string; meal?: string; counter?: string; category?: string; paidBy?: string; page?: string; size?: string;
};

function toBig(v: string | undefined): bigint | undefined {
  if (!v) return undefined;
  try {
    return BigInt(v);
  } catch {
    return undefined;
  }
}

const SELECT =
  "rounded-sm border border-line-strong bg-surface px-3.5 py-2 text-[13px] text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

/** Consumption report body — rendered inside the /reports tab shell. */
export async function ConsumptionReport({ actor, sp }: { actor: Actor; sp: ConsumptionParams }) {
  const range = resolveDateRange(sp.from, sp.to, new Date());
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = clampPageSize(sp.size, 25);
  const paidBy = sp.paidBy === "wallet" || sp.paidBy === "coupon" ? sp.paidBy : undefined;

  const f: ConsumptionFilter = {
    branchId,
    from: range.from,
    toExclusive: range.toExclusive,
    mealTypeId: toBig(sp.meal),
    counterId: toBig(sp.counter),
    categoryId: toBig(sp.category),
    paidBy,
  };
  const where = redemptionWhere(f);

  const [meals, counters, categories, total, rows, summary, byMeal, trend] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.counter.findMany({ where: { status: "active", ...(branchId ? { branchId } : {}) }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.redemption.count({ where }),
    prisma.redemption.findMany({
      where,
      include: { user: true, mealType: true, counter: true },
      orderBy: { redeemedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    consumptionSummary(prisma, f),
    usageByMeal(prisma, f),
    salesVendorTrend(prisma, f),
  ]);
  const mealColors = await mealColorMap(prisma);

  const catName = new Map(categories.map((c) => [c.id.toString(), c.name]));
  const plPositive = !summary.pl.isNegative();

  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries({ from: range.fromStr, to: range.toStr, meal: sp.meal, counter: sp.counter, category: sp.category, paidBy }))
    if (v) csvQuery.set(k, v);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">{total.toLocaleString("en-IN")} taps · {range.fromStr} → {range.toStr}</p>
        <a href={`/api/reports/consumption?${csvQuery.toString()}`} className={BTN_GHOST}>
          <DownloadGlyph />
          Export CSV
        </a>
      </div>

      <div className={`${PANEL} p-[16px_20px]`}>
        <DateRangeForm action="/reports" fromStr={range.fromStr} toStr={range.toStr} hidden={{ tab: "consumption" }}>
          <select name="meal" defaultValue={sp.meal ?? ""} aria-label="Meal" className={SELECT}>
            <option value="">All meals</option>
            {meals.map((m) => <option key={m.id.toString()} value={m.id.toString()}>{m.name}</option>)}
          </select>
          <select name="counter" defaultValue={sp.counter ?? ""} aria-label="Counter" className={SELECT}>
            <option value="">All counters</option>
            {counters.map((c) => <option key={c.id.toString()} value={c.id.toString()}>{c.name}</option>)}
          </select>
          <select name="category" defaultValue={sp.category ?? ""} aria-label="Category" className={SELECT}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id.toString()} value={c.id.toString()}>{c.name}</option>)}
          </select>
          <select name="paidBy" defaultValue={paidBy ?? ""} aria-label="Paid by" className={SELECT}>
            <option value="">Any payment</option>
            <option value="wallet">Wallet</option>
            <option value="coupon">Coupon</option>
          </select>
        </DateRangeForm>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Taps" value={summary.count.toLocaleString("en-IN")} hint="meals served in range" variant="plain" icon={<ReceiptIcon />} />
        <StatCard label="Sale value" value={inr(summary.sale)} hint="Σ category rate × taps" variant="saffron" icon={<CoinsIcon />} />
        <StatCard label="Vendor payable" value={inr(summary.cost)} hint="Σ vendor rate × taps" variant="navy" icon={<BagIcon />} />
        <StatCard
          label={plPositive ? "P&L (profit)" : "P&L (loss)"}
          value={`${plPositive ? "" : "−"}${inr(summary.pl.abs())}`}
          hint="sale − vendor payable"
          variant={plPositive ? "green" : "plain"}
          icon={<TrendingUpIcon />}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:[grid-template-columns:2fr_1fr]">
        <SaleVendorBarChart data={trend} />
        <div className={PANEL}>
          <div className="flex items-center gap-2.5 px-5 py-3.5">
            <span className="h-[17px] w-1 rounded-full bg-sage" />
            <h2 className="font-display text-base font-bold text-ink">Taps by meal</h2>
          </div>
          <div className="border-t border-line px-5 py-5">
            <DonutChart data={byMeal.map((b) => ({ label: b.label, value: b.count, color: mealColors[b.id] }))} centerLabel="Taps" />
          </div>
        </div>
      </section>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>When</th>
                <th className={TH}>Cardholder</th>
                <th className={TH}>Category</th>
                <th className={TH}>Meal</th>
                <th className={TH}>Counter</th>
                <th className={TH}>Paid by</th>
                <th className={`${TH} text-right`}>Sale</th>
                <th className={`${TH} text-right`}>Vendor</th>
                <th className={`${TH} text-right`}>P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-12 text-center text-muted">No taps match these filters.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                    <td className={`${TD} whitespace-nowrap font-mono text-[12.5px] text-muted`}>{formatDateTimeInZone(r.redeemedAt)}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <Link href={`/users/${r.userId}`} className="font-medium text-ink transition-colors hover:text-gold-deep">{r.user.fullName}</Link>
                      <span className="ml-2 font-mono text-[11.5px] text-muted-2">{r.user.code}</span>
                    </td>
                    <td className={`${TD} text-muted`}>{r.categoryId ? catName.get(r.categoryId.toString()) ?? "—" : "—"}</td>
                    <td className={`${TD} text-muted`}>{r.mealType.name}</td>
                    <td className={`${TD} text-muted`}>{r.counter.name}</td>
                    <td className={TD}>
                      <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${r.paidBy === "coupon" ? "text-gold-deep" : "text-navy-text"}`}>
                        <span className={`size-[7px] rounded-full ${r.paidBy === "coupon" ? "bg-gold" : "bg-navy"}`} />
                        {r.paidBy === "coupon" ? "Coupon" : "Wallet"}
                      </span>
                    </td>
                    <td className={`${TD} text-right font-mono font-semibold text-ink`}>{inr(r.rateApplied)}</td>
                    <td className={`${TD} text-right font-mono text-ink-2`}>{inr(r.vendorAmount)}</td>
                    <td className={`${TD} text-right`}><PL value={r.rateApplied.minus(r.vendorAmount)} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={pageSize} total={total} />
      </div>
    </>
  );
}
