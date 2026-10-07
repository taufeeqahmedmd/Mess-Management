import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type Actor } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { formatDateInZone } from "@/lib/time";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Pager } from "@/components/ui/pager";
import { PANEL, TH, TD, INPUT_FIND, BTN_PRIMARY, LINK_ACT_GOLD, LINK_ACT_DANGER, clampPageSize } from "@/components/ui/controls";
import { creditPaymentOrderAction, failPaymentOrderAction } from "../recharge/actions";

const STATUS: Record<string, { dot: string; text: string; label: string }> = {
  pending: { dot: "bg-gold", text: "text-gold-deep", label: "Pending" },
  credited: { dot: "bg-sage", text: "text-sage-deep", label: "Credited" },
  failed: { dot: "bg-muted-2", text: "text-muted", label: "Failed" },
};

const FILTER_SEL =
  "rounded-[9px] border border-line-strong bg-surface px-2.5 py-2 text-[12.5px] text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export type OnlinePaymentsParams = { q?: string; status?: string; page?: string; size?: string };

/**
 * Online (Jodo) payment orders — the operational view behind the self-service
 * top-up: what's pending, what the webhook said, and the two manual outs when
 * the gateway won't answer (credit after dashboard verification / mark failed).
 * Both outs go through the order, never a loose recharge, so reconcile can
 * never credit the same order twice.
 */
export async function OnlinePaymentsReport({ actor, sp }: { actor: Actor; sp: OnlinePaymentsParams }) {
  if (!can(actor, "recharge.view")) {
    return <p className="px-1 py-8 text-sm text-muted">You don&rsquo;t have access to online payments.</p>;
  }
  const canCredit = can(actor, "recharge.create");
  const canFail = can(actor, "recharge.edit");

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = clampPageSize(sp.size, 25);
  const q = (sp.q ?? "").trim();
  const status = ["pending", "credited", "failed"].includes(sp.status ?? "") ? sp.status : undefined;
  const filtered = Boolean(q || status);

  const where: Prisma.PaymentOrderWhereInput = {};
  if (actor.branchId) where.branchId = BigInt(actor.branchId);
  if (status) where.status = status;
  if (q) {
    // payment_orders has no user relation; resolve matching cardholders first.
    const matches = await prisma.user.findMany({
      where: { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] },
      select: { id: true },
      take: 500,
    });
    where.userId = { in: matches.length ? matches.map((u) => u.id) : [BigInt(-1)] };
  }

  const [orders, total] = await Promise.all([
    prisma.paymentOrder.findMany({
      where,
      include: { events: { orderBy: { receivedAt: "desc" }, take: 1, select: { eventCode: true, outcome: true, receivedAt: true } } },
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.paymentOrder.count({ where }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: orders.map((o) => o.userId) } },
    select: { id: true, fullName: true, code: true },
  });
  const user = (id: bigint) => users.find((u) => u.id === id);
  const couponCount = (items: unknown) =>
    Array.isArray(items) ? items.reduce<number>((s, i) => s + (Number((i as { qty?: unknown }).qty) || 0), 0) : 0;

  return (
    <>
      <p className="text-[13px] text-muted">
        Self-service top-ups paid through Jodo. Coupons are credited when Jodo&rsquo;s webhook confirms payment; the safety net polls any order
        whose webhook didn&rsquo;t arrive. Abandoned checkouts stay <span className="font-medium">Pending</span> until they expire after 3 days.
      </p>

      <div className={`${PANEL} p-[14px_20px]`}>
        <form method="get" action="/reports" className="flex flex-wrap items-center gap-2.5">
          <input type="hidden" name="tab" value="onlinePayments" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search cardholder name, ID, phone…"
            aria-label="Search online payments"
            className={`${INPUT_FIND} min-w-[220px] flex-1 sm:max-w-[320px]`}
          />
          <select name="status" defaultValue={status ?? ""} aria-label="Status" className={FILTER_SEL}>
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="credited">Credited</option>
            <option value="failed">Failed</option>
          </select>
          <button type="submit" className={BTN_PRIMARY}>Search</button>
          {filtered ? (
            <Link href="/reports?tab=onlinePayments" className="px-2 text-[13px] font-medium text-muted transition-colors hover:text-ink-2">
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Created</th>
                <th className={TH}>Cardholder</th>
                <th className={`${TH} text-right`}>Amount</th>
                <th className={`${TH} text-right`}>Coupons</th>
                <th className={TH}>Status</th>
                <th className={TH}>Gateway</th>
                <th className={TH}>Webhook</th>
                <th className={`${TH} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-muted">{filtered ? "No online payments match your filters." : "No online payments yet."}</td></tr>
              ) : (
                orders.map((o) => {
                  const u = user(o.userId);
                  const st = STATUS[o.status] ?? STATUS.failed;
                  const ev = o.events[0];
                  return (
                    <tr key={o.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} whitespace-nowrap text-muted`}>
                        {formatDateInZone(o.createdAt)}
                        <span className="ml-2 font-mono text-[11px] text-muted-2">#{o.id.toString()}</span>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        {u ? (
                          <>
                            <Link href={`/users/${u.id}`} className="font-medium text-ink transition-colors hover:text-gold-deep">{u.fullName}</Link>
                            <span className="ml-2 font-mono text-[11.5px] text-muted-2">{u.code}</span>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className={`${TD} text-right font-mono font-semibold text-ink`}>{inr(o.amount)}</td>
                      <td className={`${TD} text-right font-mono text-ink-2`}>{couponCount(o.items) || "—"}</td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-2 text-[12.5px] font-medium ${st.text}`}>
                          <span className={`size-[7px] rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-[12px] text-ink-2`}>
                        {o.paidAt ? <>Paid {formatDateInZone(o.paidAt)}</> : o.status === "pending" && o.nextCheckAt ? <span className="text-muted">Next check {formatDateInZone(o.nextCheckAt)}</span> : <span className="text-muted">—</span>}
                        {o.settlementUtr ? <div className="font-mono text-[11px] text-muted-2">UTR {o.settlementUtr}</div> : null}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-[12px]`}>
                        {ev ? (
                          <>
                            <span className="font-mono text-[11.5px] text-ink-2">{ev.eventCode.replace("order.payment.", "")}</span>
                            <span className="ml-1.5 text-muted">· {ev.outcome ?? "received"}</span>
                            <div className="text-[11px] text-muted-2">{formatDateInZone(ev.receivedAt)}</div>
                          </>
                        ) : (
                          <span className="text-muted">none</span>
                        )}
                      </td>
                      <td className={TD}>
                        <div className="flex items-center justify-end gap-1.5">
                          {o.status === "pending" && canCredit ? (
                            <ConfirmActionForm
                              action={creditPaymentOrderAction}
                              className="inline"
                              fields={{ id: o.id.toString() }}
                              confirm={{
                                title: "Credit this online payment",
                                message: `Only do this after confirming in the Jodo dashboard that order #${o.id} (${u?.fullName ?? "cardholder"}, ${inr(o.amount)}) is PAID. This grants ${couponCount(o.items)} coupon(s) once and marks the order credited.`,
                                confirmLabel: "Yes, verified — credit",
                                tone: "danger",
                              }}
                              successMessage="Order credited."
                              buttonClassName={LINK_ACT_GOLD}
                            >
                              Credit (verified)
                            </ConfirmActionForm>
                          ) : null}
                          {o.status === "pending" && canFail ? (
                            <ConfirmActionForm
                              action={failPaymentOrderAction}
                              className="inline"
                              fields={{ id: o.id.toString() }}
                              confirm={{
                                title: "Mark as not paid",
                                message: `Mark order #${o.id} as failed? Use this only when the Jodo dashboard shows it was never paid. It stops the safety net from checking it again.`,
                                confirmLabel: "Mark failed",
                                tone: "danger",
                              }}
                              successMessage="Order marked failed."
                              buttonClassName={LINK_ACT_DANGER}
                            >
                              Mark failed
                            </ConfirmActionForm>
                          ) : null}
                          {o.status === "credited" && o.rechargeId ? (
                            <Link href={`/recharge/${o.rechargeId}`} className={LINK_ACT_GOLD}>View recharge</Link>
                          ) : null}
                          {o.status === "failed" || (o.status === "pending" && !canCredit && !canFail) ? <span className="text-[12.5px] text-muted-2">—</span> : null}
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
    </>
  );
}
