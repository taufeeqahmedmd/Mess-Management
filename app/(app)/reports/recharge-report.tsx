import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type Actor } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { formatDateInZone } from "@/lib/time";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Pager } from "@/components/ui/pager";
import { PANEL, TH, TD, LINK_ACT_GOLD, LINK_ACT_DANGER, clampPageSize } from "@/components/ui/controls";
import { reverseRechargeAction } from "../recharge/actions";
import { ExpirySweepButton } from "../recharge/expiry-button";
import { RechargeImportModal } from "../recharge/import-modal";
import { RechargeDrawer } from "../recharge/edit-drawer";
import { RechargeSearch } from "../recharge/recharge-search";

const STATUS: Record<string, { dot: string; text: string; label: string }> = {
  posted: { dot: "bg-sage", text: "text-sage-deep", label: "Posted" },
  reversed: { dot: "bg-tomato", text: "text-tomato", label: "Reversed" },
  expired: { dot: "bg-muted-2", text: "text-muted", label: "Expired" },
};

/** Recharge management, rendered inside the /reports tab shell. */
export async function RechargeReport({ actor, sp }: { actor: Actor; sp: { page?: string; size?: string } }) {
  if (!can(actor, "recharge.view")) {
    return <p className="px-1 py-8 text-sm text-muted">You don&rsquo;t have access to recharges.</p>;
  }
  const canCreate = can(actor, "recharge.create");
  const canEdit = can(actor, "recharge.edit");
  const canReverse = can(actor, "recharge.delete");
  const canImport = can(actor, "recharge.import");

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = clampPageSize(sp.size, 25);

  const where: Prisma.RechargeWhereInput = actor.branchId ? { user: { branchId: BigInt(actor.branchId) } } : {};
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
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">Grant meal coupons to a cardholder.</p>
        <div className="flex flex-wrap items-center gap-2.5">
          {canImport ? <RechargeImportModal /> : null}
          {canEdit ? <ExpirySweepButton /> : null}
        </div>
      </div>

      {canCreate ? <RechargeSearch /> : null}

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
                <th className={TH}>Transaction ID</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {recharges.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-muted">No recharges yet.</td></tr>
              ) : (
                recharges.map((r) => {
                  const coupons = r.coupons.reduce((s, c) => s + c.count, 0);
                  const st = STATUS[r.status] ?? STATUS.expired;
                  return (
                    <tr key={r.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} whitespace-nowrap`}>
                        <Link href={`/recharge/${r.id}`} className="text-muted transition-colors hover:text-gold-deep">
                          {formatDateInZone(r.rechargedAt)}
                        </Link>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <Link href={`/users/${r.userId}`} className="font-medium text-ink transition-colors hover:text-gold-deep">{r.user.fullName}</Link>
                        <span className="ml-2 font-mono text-[11.5px] text-muted-2">{r.user.code}</span>
                      </td>
                      <td className={`${TD} text-right font-mono font-semibold text-ink`}>{inr(r.amount)}</td>
                      <td className={`${TD} text-right font-mono text-ink-2`}>{coupons > 0 ? coupons : "—"}</td>
                      <td className={`${TD} text-ink-2`}>{r.paymentMode.name}</td>
                      <td className={`${TD} whitespace-nowrap font-mono text-[11.5px] text-muted-2`}>{r.transactionId ?? "—"}</td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-2 text-[12.5px] font-medium ${st.text}`}>
                          <span className={`size-[7px] rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className={TD}>
                        <div className="flex items-center justify-end gap-1.5">
                          {r.status === "posted" && !r.transactionId && canEdit ? (
                            <button type="button" data-edit-recharge={r.id.toString()} className={LINK_ACT_GOLD}>Edit</button>
                          ) : null}
                          {r.status === "posted" && !r.transactionId && canReverse ? (
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
                          {r.status !== "posted" || r.transactionId || (!canEdit && !canReverse) ? (
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
    </>
  );
}
