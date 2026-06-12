import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { type Actor } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { StatCard } from "@/components/ui/stat-card";
import { DonutChart } from "@/components/reports/donut-chart";
import { Pager } from "@/components/ui/pager";
import { UsersIcon, ReceiptIcon, WalletIcon, CoinsIcon } from "@/components/reports/stat-icons";
import { BTN_GHOST, BTN_PRIMARY, INPUT_FIND, PANEL, TH, TD, clampPageSize } from "@/components/ui/controls";
import { DownloadGlyph } from "@/components/ui/glyphs";
import { activeCardholderCount, cardholdersByCategory, couponLiability, mealColorMap } from "@/services/reporting";

export type BalanceParams = { q?: string; page?: string; size?: string };

/** Balance report body — rendered inside the /reports tab shell. */
export async function BalanceReport({ actor, sp }: { actor: Actor; sp: BalanceParams }) {
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = clampPageSize(sp.size, 25);
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;

  const branchWhere: Prisma.UserWhereInput = { deletedAt: null, ...(branchId ? { branchId } : {}) };
  const tableWhere: Prisma.UserWhereInput = {
    ...branchWhere,
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { fullName: { contains: q, mode: "insensitive" } }] } : {}),
  };

  const [meals, activeCount, tableTotal, users, walletAgg, couponAgg, byCategory, liability] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    activeCardholderCount(prisma, branchId),
    prisma.user.count({ where: tableWhere }),
    prisma.user.findMany({
      where: tableWhere,
      include: { category: true, wallet: true, couponBalances: true },
      orderBy: { fullName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.wallet.aggregate({ where: { user: { is: branchWhere } }, _sum: { balanceAmount: true } }),
    prisma.couponBalance.groupBy({ by: ["mealTypeId"], where: { user: { is: branchWhere } }, _sum: { count: true } }),
    cardholdersByCategory(prisma, branchId),
    couponLiability(prisma, branchId),
  ]);
  const mealColors = await mealColorMap(prisma);

  const walletTotal = walletAgg._sum.balanceAmount ?? new Prisma.Decimal(0);
  const couponTotals = new Map(couponAgg.map((g) => [g.mealTypeId.toString(), g._sum.count ?? 0]));
  const couponsOnHand = [...couponTotals.values()].reduce((s, n) => s + n, 0);
  const maxMeal = Math.max(1, ...meals.map((m) => couponTotals.get(m.id.toString()) ?? 0));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">{activeCount.toLocaleString("en-IN")} cardholders · wallet {inr(walletTotal)} on hand</p>
        <a href={`/api/reports/balances${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={BTN_GHOST}>
          <DownloadGlyph />
          Export CSV
        </a>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Cardholders" value={activeCount.toLocaleString("en-IN")} hint="active accounts" variant="plain" icon={<UsersIcon />} />
        <StatCard label="Coupons on hand" value={couponsOnHand.toLocaleString("en-IN")} hint="unredeemed across all meals" variant="saffron" icon={<ReceiptIcon />} />
        <StatCard label="Wallet on hand" value={inr(walletTotal)} hint="sum of wallet balances" variant="navy" icon={<WalletIcon />} />
        <StatCard label="Coupon liability" value={inr(liability)} hint="coupons × vendor rate" variant="green" icon={<CoinsIcon />} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={PANEL}>
          <div className="flex items-center justify-between gap-2.5 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="h-[17px] w-1 rounded-full bg-gold" />
              <h2 className="font-display text-base font-bold text-ink">Coupons remaining by meal</h2>
            </div>
            <span className="text-[11.5px] text-muted-2">unredeemed</span>
          </div>
          <div className="flex flex-col gap-3.5 border-t border-line px-5 py-4">
            {meals.length === 0 ? (
              <p className="text-sm text-muted">No meals configured.</p>
            ) : (
              meals.map((m) => {
                const n = couponTotals.get(m.id.toString()) ?? 0;
                return (
                  <div key={m.id.toString()}>
                    <div className="mb-1 flex items-center justify-between text-[13px]">
                      <span className="text-ink">{m.name}</span>
                      <span className="text-muted"><b className="font-semibold text-ink">{n.toLocaleString("en-IN")}</b> coupons</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full border border-line bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${(n / maxMeal) * 100}%`, background: mealColors[m.id.toString()] }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={PANEL}>
          <div className="flex items-center gap-2.5 px-5 py-3.5">
            <span className="h-[17px] w-1 rounded-full bg-sage" />
            <h2 className="font-display text-base font-bold text-ink">Cardholders by category</h2>
          </div>
          <div className="border-t border-line px-5 py-5">
            <DonutChart data={byCategory.map((c) => ({ label: c.label, value: c.value }))} centerLabel="Holders" />
          </div>
        </div>
      </section>

      <div className={`${PANEL} p-[18px_20px]`}>
        <form method="get" className="flex flex-col gap-2.5 sm:flex-row">
          <input type="hidden" name="tab" value="balances" />
          <input name="q" defaultValue={q} placeholder="Search by name or code…" className={`${INPUT_FIND} sm:max-w-[420px]`} />
          <button type="submit" className={BTN_PRIMARY}>Search</button>
        </form>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Cardholder</th>
                <th className={TH}>Category</th>
                <th className={`${TH} text-right`}>Wallet</th>
                {meals.map((m) => <th key={m.id.toString()} className={`${TH} text-right`}>{m.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={3 + meals.length} className="px-5 py-12 text-center text-muted">No cardholders match your search.</td></tr>
              ) : (
                users.map((u) => {
                  const byMeal = new Map(u.couponBalances.map((c) => [c.mealTypeId.toString(), c.count]));
                  return (
                    <tr key={u.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} whitespace-nowrap`}>
                        <Link href={`/users/${u.id}`} className="font-medium text-ink transition-colors hover:text-gold-deep">{u.fullName}</Link>
                        <span className="ml-2 font-mono text-[11.5px] text-muted-2">{u.code}</span>
                      </td>
                      <td className={`${TD} text-muted`}>{u.category.name}</td>
                      <td className={`${TD} text-right font-mono font-semibold text-ink`}>{inr(u.wallet?.balanceAmount ?? new Prisma.Decimal(0))}</td>
                      {meals.map((m) => {
                        const n = byMeal.get(m.id.toString()) ?? 0;
                        return <td key={m.id.toString()} className={`${TD} text-right font-mono ${n > 0 ? "font-semibold text-ink" : "text-muted-2"}`}>{n}</td>;
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={pageSize} total={tableTotal} />
      </div>
    </>
  );
}
