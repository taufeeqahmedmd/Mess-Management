import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { reverseRechargeAction } from "./actions";

const PAGE_SIZE = 20;

function rechargeStatusDot(status: string) {
  if (status === "posted") return "bg-sage";
  if (status === "expired") return "bg-muted-2";
  return "bg-tomato"; // reversed
}

export default async function RechargePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "recharge.view")) redirect("/dashboard");
  const canCreate = can(actor, "recharge.create");
  const canEdit = can(actor, "recharge.edit");
  const canReverse = can(actor, "recharge.delete");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const branchFilter = actor.branchId ? { branchId: BigInt(actor.branchId) } : {};

  // Cardholder search (to start a recharge)
  const matches = q
    ? await prisma.user.findMany({
        where: {
          deletedAt: null,
          ...branchFilter,
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { fullName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { cards: { some: { cardUid: { contains: q } } } },
          ],
        },
        include: { category: true, wallet: true },
        orderBy: { fullName: "asc" },
        take: 10,
      })
    : [];

  // Recent recharges
  const where: Prisma.RechargeWhereInput = actor.branchId
    ? { user: { branchId: BigInt(actor.branchId) } }
    : {};
  const [recharges, total] = await Promise.all([
    prisma.recharge.findMany({
      where,
      include: { user: true, paymentMode: true, appUser: true, coupons: true },
      orderBy: { id: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.recharge.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Recharge</h1>
        <p className="mt-1 text-sm text-ink-2">Top up a cardholder&rsquo;s wallet or grant meal coupons.</p>
      </div>

      {canCreate ? (
        <div className="rounded-md border border-line bg-surface p-4">
          <form method="get" className="flex max-w-md gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Find a cardholder to recharge…"
              className="w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
            />
            <button type="submit" className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
              Search
            </button>
          </form>
          {q ? (
            <div className="mt-3 flex flex-col gap-1.5">
              {matches.length === 0 ? (
                <p className="text-sm text-ink-2">No cardholders match.</p>
              ) : (
                matches.map((u) => (
                  <div key={u.id.toString()} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-sm">
                    <span className="text-ink">
                      <span className="font-mono">{u.code}</span> · {u.fullName} · {u.category.name}
                      <span className="ml-2 font-mono text-muted">₹{(u.wallet?.balanceAmount ?? new Prisma.Decimal(0)).toFixed(2)}</span>
                    </span>
                    <Link href={`/recharge/new?userId=${u.id}`} className="rounded-sm bg-gold px-3 py-1.5 text-xs font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep">
                      Recharge
                    </Link>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Cardholder</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Coupons</th>
              <th className="px-4 py-3 font-semibold">Mode</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {recharges.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-2">No recharges yet.</td></tr>
            ) : (
              recharges.map((r) => {
                const coupons = r.coupons.reduce((s, c) => s + c.count, 0);
                return (
                  <tr key={r.id.toString()} className="border-t border-line">
                    <td className="px-4 py-3 text-ink-2">{r.rechargedAt.toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/users/${r.userId}`} className="text-ink transition-colors hover:text-gold-deep">{r.user.fullName}</Link>
                      <span className="ml-1 font-mono text-xs text-muted">{r.user.code}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink">₹{r.amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-ink-2">{coupons > 0 ? coupons : "—"}</td>
                    <td className="px-4 py-3 text-ink-2">{r.paymentMode.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-ink-2">
                        <span className={`size-2 rounded-pill ${rechargeStatusDot(r.status)}`} />
                        {r.status[0].toUpperCase() + r.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {r.status === "posted" && canEdit ? (
                          <Link href={`/recharge/${r.id}/edit`} className="rounded-sm px-2.5 py-1 text-xs font-medium text-gold-deep transition-colors hover:bg-gold/10">
                            Edit
                          </Link>
                        ) : null}
                        {r.status === "posted" && canReverse ? (
                          <ConfirmActionForm
                            action={reverseRechargeAction}
                            className="inline"
                            fields={{ id: r.id.toString() }}
                            confirm={{
                              title: "Reverse recharge",
                              message: `Reverse the unspent remainder of this recharge for ${r.user.fullName}?`,
                              confirmLabel: "Yes, reverse",
                              tone: "danger",
                            }}
                            successMessage="Recharge reversed."
                            buttonClassName="rounded-sm px-2.5 py-1 text-xs font-medium text-tomato transition-colors hover:bg-tomato-soft disabled:opacity-60"
                          >
                            Reverse
                          </ConfirmActionForm>
                        ) : null}
                        {r.status !== "posted" || (!canEdit && !canReverse) ? (
                          <span className="text-xs text-muted-2">—</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-2">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={`/recharge?page=${page - 1}`} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">Previous</Link> : null}
            {page < totalPages ? <Link href={`/recharge?page=${page + 1}`} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">Next</Link> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
