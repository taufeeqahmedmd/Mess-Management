import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Pager } from "@/components/ui/pager";
import { BTN_PRIMARY, INPUT_FIND, PANEL, TH, TD, LINK_ACT_GOLD, LINK_ACT_DANGER, clampPageSize } from "@/components/ui/controls";
import { reverseRechargeAction } from "./actions";
import { ExpirySweepButton } from "./expiry-button";
import { RechargeImportModal } from "./import-modal";
import { RechargeDrawer } from "./edit-drawer";

const STATUS: Record<string, { dot: string; text: string; label: string }> = {
  posted: { dot: "bg-sage", text: "text-sage-deep", label: "Posted" },
  reversed: { dot: "bg-tomato", text: "text-tomato", label: "Reversed" },
  expired: { dot: "bg-muted-2", text: "text-muted", label: "Expired" },
};

export default async function RechargePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; size?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "recharge.view")) redirect("/dashboard");
  const canCreate = can(actor, "recharge.create");
  const canEdit = can(actor, "recharge.edit");
  const canReverse = can(actor, "recharge.delete");
  const canImport = can(actor, "recharge.import");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = clampPageSize(sp.size, 25);
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
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.recharge.count({ where }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Recharge</h1>
          <p className="mt-1 text-[13px] text-muted">Top up a cardholder&rsquo;s wallet or grant meal coupons.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {canImport ? <RechargeImportModal /> : null}
          {canEdit ? <ExpirySweepButton /> : null}
        </div>
      </div>

      {canCreate ? (
        <div className={`${PANEL} p-[18px_20px]`}>
          <form method="get" className="flex flex-col gap-2.5 sm:flex-row">
            <input name="q" defaultValue={q} placeholder="Find a cardholder to recharge…" className={`${INPUT_FIND} sm:max-w-[420px]`} />
            <button type="submit" className={BTN_PRIMARY}>Search</button>
          </form>
          {q ? (
            <div className="mt-3 flex flex-col gap-1.5">
              {matches.length === 0 ? (
                <p className="text-sm text-muted">No cardholders match.</p>
              ) : (
                matches.map((u) => (
                  <div key={u.id.toString()} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-[13px]">
                    <span className="text-ink">
                      <span className="font-mono">{u.code}</span> · {u.fullName} · {u.category.name}
                      <span className="ml-2 font-mono text-muted">{inr(u.wallet?.balanceAmount ?? new Prisma.Decimal(0))}</span>
                    </span>
                    <button type="button" data-recharge-user={u.id.toString()} className={BTN_PRIMARY}>Recharge</button>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Date</th>
                <th className={TH}>Cardholder</th>
                <th className={`${TH} text-right`}>Amount</th>
                <th className={`${TH} text-right`}>Coupons</th>
                <th className={TH}>Mode</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {recharges.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-muted">No recharges yet.</td></tr>
              ) : (
                recharges.map((r) => {
                  const coupons = r.coupons.reduce((s, c) => s + c.count, 0);
                  const st = STATUS[r.status] ?? STATUS.expired;
                  return (
                    <tr key={r.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} whitespace-nowrap`}>
                        <Link href={`/recharge/${r.id}`} className="text-muted transition-colors hover:text-gold-deep">
                          {r.rechargedAt.toISOString().slice(0, 10)}
                        </Link>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <Link href={`/users/${r.userId}`} className="font-medium text-ink transition-colors hover:text-gold-deep">{r.user.fullName}</Link>
                        <span className="ml-2 font-mono text-[11.5px] text-muted-2">{r.user.code}</span>
                      </td>
                      <td className={`${TD} text-right font-mono font-semibold text-ink`}>{inr(r.amount)}</td>
                      <td className={`${TD} text-right font-mono text-ink-2`}>{coupons > 0 ? coupons : "—"}</td>
                      <td className={`${TD} text-ink-2`}>{r.paymentMode.name}</td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-2 text-[12.5px] font-medium ${st.text}`}>
                          <span className={`size-[7px] rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className={TD}>
                        <div className="flex items-center justify-end gap-1.5">
                          {r.status === "posted" && canEdit ? (
                            <button type="button" data-edit-recharge={r.id.toString()} className={LINK_ACT_GOLD}>Edit</button>
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
                              buttonClassName={LINK_ACT_DANGER}
                            >
                              Reverse
                            </ConfirmActionForm>
                          ) : null}
                          {r.status !== "posted" || (!canEdit && !canReverse) ? (
                            <span className="text-[12.5px] text-muted-2">—</span>
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
        <Pager page={page} pageSize={pageSize} total={total} />
      </div>

      {canCreate || canEdit ? <RechargeDrawer /> : null}
    </div>
  );
}
