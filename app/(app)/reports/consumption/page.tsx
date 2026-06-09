import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { DateRangeForm } from "@/components/reports/date-range-form";
import { PL } from "@/components/reports/breakdown-table";
import { resolveDateRange, redemptionWhere, type ConsumptionFilter } from "@/services/reporting";

const PAGE_SIZE = 25;

function toBig(v: string | undefined): bigint | undefined {
  if (!v) return undefined;
  try {
    return BigInt(v);
  } catch {
    return undefined;
  }
}

const SELECT =
  "rounded-sm border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export default async function ConsumptionReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    meal?: string;
    counter?: string;
    category?: string;
    paidBy?: string;
    page?: string;
  }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "reports.view")) redirect("/dashboard");

  const sp = await searchParams;
  const range = resolveDateRange(sp.from, sp.to, new Date());
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
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

  const [meals, counters, categories, total, rows] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.counter.findMany({
      where: { status: "active", ...(branchId ? { branchId } : {}) },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.redemption.count({ where }),
    prisma.redemption.findMany({
      where,
      include: { user: true, mealType: true, counter: true },
      orderBy: { redeemedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const catName = new Map(categories.map((c) => [c.id.toString(), c.name]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries({ from: range.fromStr, to: range.toStr, meal: sp.meal, counter: sp.counter, category: sp.category, paidBy }))
    if (v) csvQuery.set(k, v);

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-xs text-ink-2 transition-colors hover:text-gold-deep">
            ← Reports
          </Link>
          <h1 className="font-display text-2xl font-semibold text-ink">Consumption report</h1>
          <p className="mt-1 text-sm text-ink-2">
            {total.toLocaleString("en-IN")} taps · {range.fromStr} → {range.toStr}
          </p>
        </div>
        <a
          href={`/api/reports/consumption?${csvQuery.toString()}`}
          className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep"
        >
          Export CSV
        </a>
      </div>

      <div className="rounded-md border border-line bg-surface p-4">
        <DateRangeForm action="/reports/consumption" fromStr={range.fromStr} toStr={range.toStr}>
          <select name="meal" defaultValue={sp.meal ?? ""} aria-label="Meal" className={SELECT}>
            <option value="">All meals</option>
            {meals.map((m) => (
              <option key={m.id.toString()} value={m.id.toString()}>{m.name}</option>
            ))}
          </select>
          <select name="counter" defaultValue={sp.counter ?? ""} aria-label="Counter" className={SELECT}>
            <option value="">All counters</option>
            {counters.map((c) => (
              <option key={c.id.toString()} value={c.id.toString()}>{c.name}</option>
            ))}
          </select>
          <select name="category" defaultValue={sp.category ?? ""} aria-label="Category" className={SELECT}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id.toString()} value={c.id.toString()}>{c.name}</option>
            ))}
          </select>
          <select name="paidBy" defaultValue={paidBy ?? ""} aria-label="Paid by" className={SELECT}>
            <option value="">Any payment</option>
            <option value="wallet">Wallet</option>
            <option value="coupon">Coupon</option>
          </select>
        </DateRangeForm>
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Cardholder</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Meal</th>
              <th className="px-4 py-3 font-semibold">Counter</th>
              <th className="px-4 py-3 font-semibold">Paid by</th>
              <th className="px-4 py-3 text-right font-semibold">Sale</th>
              <th className="px-4 py-3 text-right font-semibold">Vendor</th>
              <th className="px-4 py-3 text-right font-semibold">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-ink-2">
                  No taps match these filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id.toString()} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-xs text-ink-2">
                    {r.redeemedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/users/${r.userId}`} className="text-ink transition-colors hover:text-gold-deep">
                      {r.user.fullName}
                    </Link>
                    <span className="ml-1 font-mono text-xs text-muted">{r.user.code}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{r.categoryId ? catName.get(r.categoryId.toString()) ?? "—" : "—"}</td>
                  <td className="px-4 py-3 text-ink-2">{r.mealType.name}</td>
                  <td className="px-4 py-3 text-ink-2">{r.counter.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <span className={`size-2 rounded-pill ${r.paidBy === "coupon" ? "bg-gold" : "bg-sage"}`} />
                      {r.paidBy === "coupon" ? "Coupon" : "Wallet"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink-2">{inr(r.rateApplied)}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-2">{inr(r.vendorAmount)}</td>
                  <td className="px-4 py-3 text-right">
                    <PL value={r.rateApplied.minus(r.vendorAmount)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <Pagination page={page} totalPages={totalPages} sp={sp} />
      ) : null}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  sp,
}: {
  page: number;
  totalPages: number;
  sp: Record<string, string | undefined>;
}) {
  const link = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: String(p) })) if (v) q.set(k, v);
    return `/reports/consumption?${q.toString()}`;
  };
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-2">Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={link(page - 1)} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">
            Previous
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link href={link(page + 1)} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">
            Next
          </Link>
        ) : null}
      </div>
    </div>
  );
}
