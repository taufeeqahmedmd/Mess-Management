import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";

const PAGE_SIZE = 25;

export default async function BalanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "reports.view")) redirect("/dashboard");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;

  const userWhere: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(branchId ? { branchId } : {}),
    ...(q
      ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { fullName: { contains: q, mode: "insensitive" } }] }
      : {}),
  };

  const [meals, total, users, walletAgg, couponAgg] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.user.count({ where: userWhere }),
    prisma.user.findMany({
      where: userWhere,
      include: { category: true, wallet: true, couponBalances: true },
      orderBy: { fullName: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.wallet.aggregate({ where: { user: { is: userWhere } }, _sum: { balanceAmount: true } }),
    prisma.couponBalance.groupBy({
      by: ["mealTypeId"],
      where: { user: { is: userWhere } },
      _sum: { count: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const walletTotal = walletAgg._sum.balanceAmount ?? new Prisma.Decimal(0);
  const couponTotals = new Map(couponAgg.map((g) => [g.mealTypeId.toString(), g._sum.count ?? 0]));

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-xs text-ink-2 transition-colors hover:text-gold-deep">
            ← Reports
          </Link>
          <h1 className="font-display text-2xl font-semibold text-ink">Balance report</h1>
          <p className="mt-1 text-sm text-ink-2">
            {total.toLocaleString("en-IN")} cardholders · wallet {inr(walletTotal)} on hand
          </p>
        </div>
        <a
          href={`/api/reports/balances${q ? `?q=${encodeURIComponent(q)}` : ""}`}
          className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep"
        >
          Export CSV
        </a>
      </div>

      <div className="rounded-md border border-line bg-surface p-4">
        <form method="get" className="flex max-w-md gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name or code…"
            className="w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
          />
          <button type="submit" className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
            Search
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">Cardholder</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 text-right font-semibold">Wallet</th>
              {meals.map((m) => (
                <th key={m.id.toString()} className="px-4 py-3 text-right font-semibold">{m.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={3 + meals.length} className="px-4 py-10 text-center text-ink-2">
                  No cardholders match.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const byMeal = new Map(u.couponBalances.map((c) => [c.mealTypeId.toString(), c.count]));
                return (
                  <tr key={u.id.toString()} className="border-t border-line">
                    <td className="px-4 py-3">
                      <Link href={`/users/${u.id}`} className="text-ink transition-colors hover:text-gold-deep">
                        {u.fullName}
                      </Link>
                      <span className="ml-1 font-mono text-xs text-muted">{u.code}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{u.category.name}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink">
                      {inr(u.wallet?.balanceAmount ?? new Prisma.Decimal(0))}
                    </td>
                    {meals.map((m) => {
                      const n = byMeal.get(m.id.toString()) ?? 0;
                      return (
                        <td key={m.id.toString()} className={`px-4 py-3 text-right font-mono ${n > 0 ? "text-ink-2" : "text-muted-2"}`}>
                          {n}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
          {users.length > 0 ? (
            <tfoot>
              <tr className="border-t border-line-strong bg-surface-2 font-semibold text-ink">
                <td className="px-4 py-3" colSpan={2}>Branch total</td>
                <td className="px-4 py-3 text-right font-mono">{inr(walletTotal)}</td>
                {meals.map((m) => (
                  <td key={m.id.toString()} className="px-4 py-3 text-right font-mono">
                    {(couponTotals.get(m.id.toString()) ?? 0).toLocaleString("en-IN")}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-2">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={`/reports/balances?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}`} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={`/reports/balances?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
