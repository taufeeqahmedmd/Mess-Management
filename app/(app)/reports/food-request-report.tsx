import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { type Actor } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { StatCard } from "@/components/ui/stat-card";
import { DateRangeForm } from "@/components/reports/date-range-form";
import { Pager } from "@/components/ui/pager";
import { ReceiptIcon, CoinsIcon, BagIcon } from "@/components/reports/stat-icons";
import { BTN_GHOST, PANEL, TH, TD, clampPageSize } from "@/components/ui/controls";
import { DownloadGlyph } from "@/components/ui/glyphs";
import { Prisma, type FoodRequestStatus } from "@prisma/client";
import { resolveDateRange } from "@/services/reporting";
import { formatDateInZone } from "@/lib/time";
import { foodRequestReport, type FrBreakdown } from "@/services/food-request-reporting";
import { FOOD_REQUEST_STATUS_META } from "@/services/food-request";

export type FoodRequestReportParams = { from?: string; to?: string; status?: string; page?: string; size?: string };

const STATUSES: FoodRequestStatus[] = [
  "raised", "pending_approval", "approved", "vendor_accepted", "preparing", "out_for_delivery", "delivered", "rejected", "cancelled",
];

const SELECT =
  "rounded-sm border border-line-strong bg-surface px-3.5 py-2 text-[13px] text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

function BreakdownCard({ title, accent, rows }: { title: string; accent: string; rows: FrBreakdown[] }) {
  return (
    <div className={PANEL}>
      <div className="flex items-center gap-2.5 px-5 py-3.5">
        <span className={`h-[17px] w-1 rounded-full ${accent}`} />
        <h2 className="font-display text-base font-bold text-ink">{title}</h2>
      </div>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[360px]">
          <thead>
            <tr className="text-left">
              <th className={TH}>Name</th>
              <th className={`${TH} text-right`}>Orders</th>
              <th className={`${TH} text-right`}>Charged</th>
              <th className={`${TH} text-right`}>Vendor cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-muted">No delivered orders.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className={`${TD} text-ink-2`}>{r.label}</td>
                  <td className={`${TD} text-right font-mono text-ink-2`}>{r.count}</td>
                  <td className={`${TD} text-right font-mono font-semibold text-ink`}>{inr(r.charged)}</td>
                  <td className={`${TD} text-right font-mono text-muted`}>{inr(r.vendor)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Food-requests report — rendered inside the /reports tab shell. */
export async function FoodRequestReport({ actor, sp }: { actor: Actor; sp: FoodRequestReportParams }) {
  const range = resolveDateRange(sp.from, sp.to, new Date());
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = clampPageSize(sp.size, 25);
  const status = STATUSES.includes(sp.status as FoodRequestStatus) ? (sp.status as FoodRequestStatus) : undefined;

  const listWhere: Prisma.FoodRequestWhereInput = {
    createdAt: { gte: range.from, lt: range.toExclusive },
    ...(branchId ? { branchId } : {}),
    ...(status ? { status } : {}),
  };

  const [report, total, rows] = await Promise.all([
    foodRequestReport(prisma, { branchId, from: range.from, toExclusive: range.toExclusive }),
    prisma.foodRequest.count({ where: listWhere }),
    prisma.foodRequest.findMany({
      where: listWhere,
      include: { user: { include: { department: true } }, vendor: true, _count: { select: { items: true } } },
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries({ from: range.fromStr, to: range.toStr, status })) if (v) csvQuery.set(k, v);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">{report.total.toLocaleString("en-IN")} requests · {range.fromStr} → {range.toStr}</p>
        <div className="flex items-center gap-2">
          <DateRangeForm action="/reports" fromStr={range.fromStr} toStr={range.toStr} hidden={{ tab: "foodRequests" }} active={Boolean(sp.from || sp.to || status)}>
            <select name="status" defaultValue={status ?? ""} aria-label="Status" className={SELECT}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{FOOD_REQUEST_STATUS_META[s].label}</option>)}
            </select>
          </DateRangeForm>
          <a href={`/api/reports/food-requests?${csvQuery.toString()}`} className={BTN_GHOST}>
            <DownloadGlyph />
            Export CSV
          </a>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending" value={report.pending.toLocaleString("en-IN")} hint="still in flight" variant="plain" icon={<ReceiptIcon />} />
        <StatCard label="Delivered" value={report.delivered.toLocaleString("en-IN")} hint={`${report.closed} rejected / cancelled`} variant="green" icon={<ReceiptIcon />} />
        <StatCard label="Charged" value={inr(report.charged)} hint="Σ delivered → RFID accounts" variant="saffron" icon={<CoinsIcon />} />
        <StatCard label="Vendor cost" value={inr(report.vendorCost)} hint="Σ delivered → vendors" variant="navy" icon={<BagIcon />} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <BreakdownCard title="Cost by department" accent="bg-sage" rows={report.byDepartment} />
        <BreakdownCard title="Cost by requestor" accent="bg-gold" rows={report.byRequestor} />
        <BreakdownCard title="Vendor performance" accent="bg-navy" rows={report.byVendor} />
      </section>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Ref</th>
                <th className={TH}>Raised</th>
                <th className={TH}>Cardholder</th>
                <th className={TH}>Department</th>
                <th className={TH}>Vendor</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Charged</th>
                <th className={`${TH} text-right`}>Vendor cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-muted">No requests match these filters.</td></tr>
              ) : (
                rows.map((r) => {
                  const meta = FOOD_REQUEST_STATUS_META[r.status];
                  return (
                    <tr key={r.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} whitespace-nowrap`}>
                        <Link href={`/food-requests/${r.id}`} className="font-mono text-[12.5px] font-medium text-ink transition-colors hover:text-gold-deep">{r.code}</Link>
                      </td>
                      <td className={`${TD} whitespace-nowrap font-mono text-[12.5px] text-muted`}>{formatDateInZone(r.createdAt)}</td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <Link href={`/users/${r.userId}`} className="font-medium text-ink transition-colors hover:text-gold-deep">{r.user.fullName}</Link>
                        <span className="ml-2 font-mono text-[11.5px] text-muted-2">{r.user.code}</span>
                      </td>
                      <td className={`${TD} text-muted`}>{r.user.department?.name ?? "—"}</td>
                      <td className={`${TD} text-muted`}>{r.vendor?.name ?? "—"}</td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-2 text-[12.5px] font-medium ${meta.text}`}>
                          <span className={`size-[7px] rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className={`${TD} text-right font-mono font-semibold text-ink`}>{inr(r.amount)}</td>
                      <td className={`${TD} text-right font-mono text-muted`}>{inr(r.vendorAmount)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={pageSize} total={total} />
      </div>
    </>
  );
}
