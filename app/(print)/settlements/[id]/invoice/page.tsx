import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can, canAccessBranch } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { formatDateTimeInZone } from "@/lib/time";
import { usageByDay, usageByMeal, usageByCategory } from "@/services/reporting";
import { settlementStatusLabel } from "@/services/settlement";
import { PrintToolbar } from "./print-toolbar";

const ZERO = new Prisma.Decimal(0);

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const TH = "border border-line-strong px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-ink-2";
const TD = "border border-line px-2.5 py-1.5 text-[12.5px] text-ink";
const NUM = `${TD} text-right font-mono`;

/**
 * Printable invoice for a raised settlement (status approved/paid): day-wise
 * coupons and amounts split by meal, a meal-wise summary, and a summary by
 * category. Lives outside the app shell so the printout is just the document.
 * The headline amount is the frozen settlement snapshot; the tables are
 * recomputed from the ledger, and any drift is called out rather than hidden.
 */
export default async function SettlementInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "settlements.view")) redirect("/dashboard");

  const { id: idStr } = await params;
  let id: bigint;
  try {
    id = BigInt(idStr);
  } catch {
    notFound();
  }

  const s = await prisma.vendorSettlement.findUnique({ where: { id }, include: { vendor: true, branch: true } });
  if (!s || !canAccessBranch(actor, s.branchId.toString())) notFound();
  if (s.status === "draft") redirect(`/settlements/${s.id}`); // no invoice until it's raised

  const toExclusive = new Date(s.periodEnd.getFullYear(), s.periodEnd.getMonth(), s.periodEnd.getDate() + 1);
  const filter = { branchId: s.branchId, from: s.periodStart, toExclusive };
  const [byDay, byMeal, byCategory] = await Promise.all([
    usageByDay(prisma, filter),
    usageByMeal(prisma, filter),
    usageByCategory(prisma, filter),
  ]);

  const { meals, days } = byDay;
  const showTotalGroup = meals.length > 1;
  const groups = showTotalGroup ? [...meals, { id: "__total", label: "Total" }] : meals;
  const liveCount = days.reduce((n, d) => n + d.count, 0);
  const liveAmount = days.reduce((sum, d) => sum.plus(d.cost), ZERO);
  const drifted = liveCount !== s.mealCount || !liveAmount.equals(s.grossAmount);

  const periodStart = s.periodStart.toISOString().slice(0, 10);
  const periodEnd = s.periodEnd.toISOString().slice(0, 10);
  const invoiceNo = `INV-${s.vendor.code}-${String(s.id).padStart(4, "0")}`;

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-6 py-6 print:max-w-none print:gap-5 print:p-0">
      <style>{`@media print { @page { size: A4; margin: 12mm; } tr { break-inside: avoid; } section { break-inside: avoid; } }`}</style>
      <PrintToolbar backHref={`/settlements/${s.id}`} />

      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-line-strong pb-5">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Vendor Invoice</h1>
          <p className="mt-0.5 font-mono text-sm text-ink-2">{invoiceNo}</p>
          <p className="mt-2 text-sm text-ink">
            <span className="font-semibold">{s.vendor.name}</span>
            <span className="ml-1.5 font-mono text-xs text-ink-2">{s.vendor.code}</span>
          </p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="font-medium text-ink-2">Branch</dt>
          <dd className="text-right text-ink">{s.branch.name}</dd>
          <dt className="font-medium text-ink-2">Period</dt>
          <dd className="text-right font-mono text-[12.5px] text-ink">{periodStart} → {periodEnd}</dd>
          <dt className="font-medium text-ink-2">Status</dt>
          <dd className="text-right text-ink">{settlementStatusLabel(s.status)}</dd>
          <dt className="font-medium text-ink-2">Generated</dt>
          <dd className="text-right font-mono text-[12.5px] text-ink">{formatDateTimeInZone(new Date())}</dd>
        </dl>
      </header>

      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-2">Coupons (meals served)</p>
          <p className="font-mono text-xl font-semibold text-ink">{s.mealCount.toLocaleString("en-IN")}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-2">Invoice amount</p>
          <p className="font-mono text-2xl font-bold text-ink">{inr(s.grossAmount)}</p>
        </div>
      </section>
      {drifted ? (
        <p className="rounded-sm border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2">
          Note: the invoice amount is the frozen snapshot taken when the invoice was raised. Current data
          totals {liveCount.toLocaleString("en-IN")} coupons / {inr(liveAmount)} — the detail below reflects current data.
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 font-display text-base font-bold text-ink">Day-wise coupons &amp; amount</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th rowSpan={2} className={`${TH} align-bottom`}>Date</th>
              {groups.map((g) => (
                <th key={g.id || "none"} colSpan={2} className={`${TH} text-center`}>{g.label}</th>
              ))}
            </tr>
            <tr>
              {groups.map((g) => (
                <FragmentedSubHeads key={g.id || "none"} />
              ))}
            </tr>
          </thead>
          <tbody>
            {days.length === 0 ? (
              <tr><td colSpan={1 + groups.length * 2} className={`${TD} py-6 text-center text-ink-2`}>No activity in this period.</td></tr>
            ) : (
              days.map((d) => (
                <tr key={d.date}>
                  <td className={`${TD} whitespace-nowrap`}>{dayLabel(d.date)}</td>
                  {meals.map((m) => {
                    const cell = d.byMeal[m.id];
                    return (
                      <FragmentedCells key={m.id || "none"} count={cell?.count} cost={cell?.cost} />
                    );
                  })}
                  {showTotalGroup ? <FragmentedCells count={d.count} cost={d.cost} strong /> : null}
                </tr>
              ))
            )}
          </tbody>
          {days.length > 0 ? (
            <tfoot>
              <tr className="font-bold">
                <td className={TD}>Total</td>
                {meals.map((m) => (
                  <FragmentedCells
                    key={m.id || "none"}
                    count={days.reduce((n, d) => n + (d.byMeal[m.id]?.count ?? 0), 0)}
                    cost={days.reduce((sum, d) => sum.plus(d.byMeal[m.id]?.cost ?? ZERO), ZERO)}
                    strong
                  />
                ))}
                {showTotalGroup ? <FragmentedCells count={liveCount} cost={liveAmount} strong /> : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </section>

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2">
        <SummaryTable heading="Summary by meal" unit="Meal" rows={byMeal} />
        <SummaryTable heading="Summary by category" unit="Category" rows={byCategory} />
      </section>

      <footer className="mt-6 grid grid-cols-2 gap-10 print:mt-10">
        <div className="border-t border-line-strong pt-2 text-sm text-ink-2">For {s.vendor.name}</div>
        <div className="border-t border-line-strong pt-2 text-right text-sm text-ink-2">For {s.branch.name}</div>
      </footer>
    </div>
  );
}

/** The Coupons / Amount sub-header pair under each meal group. */
function FragmentedSubHeads() {
  return (
    <>
      <th className={`${TH} text-right`}>Coupons</th>
      <th className={`${TH} text-right`}>Amount</th>
    </>
  );
}

/** A Coupons / Amount cell pair; em-dash when the meal had no taps that day. */
function FragmentedCells({ count, cost, strong = false }: { count?: number; cost?: Prisma.Decimal; strong?: boolean }) {
  const cls = strong ? `${NUM} font-semibold` : NUM;
  return (
    <>
      <td className={cls}>{count ?? "—"}</td>
      <td className={cls}>{cost ? inr(cost) : "—"}</td>
    </>
  );
}

function SummaryTable({
  heading,
  unit,
  rows,
}: {
  heading: string;
  unit: string;
  rows: { id: string; label: string; count: number; cost: Prisma.Decimal }[];
}) {
  const totalCount = rows.reduce((n, r) => n + r.count, 0);
  const totalCost = rows.reduce((sum, r) => sum.plus(r.cost), ZERO);
  return (
    <div>
      <h2 className="mb-2 font-display text-base font-bold text-ink">{heading}</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>{unit}</th>
            <th className={`${TH} text-right`}>Coupons</th>
            <th className={`${TH} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={3} className={`${TD} py-6 text-center text-ink-2`}>No activity.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id || r.label}>
                <td className={TD}>{r.label}</td>
                <td className={NUM}>{r.count}</td>
                <td className={NUM}>{inr(r.cost)}</td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 ? (
          <tfoot>
            <tr className="font-bold">
              <td className={TD}>Total</td>
              <td className={`${NUM} font-semibold`}>{totalCount}</td>
              <td className={`${NUM} font-semibold`}>{inr(totalCost)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
