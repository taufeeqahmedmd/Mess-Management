import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { can, type Actor } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { formatDateInZone } from "@/lib/time";
import { resolveDateRange, parseRechargeFilter, rechargeWhere } from "@/services/reporting";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { DateRangeForm } from "@/components/reports/date-range-form";
import { Pager } from "@/components/ui/pager";
import { DownloadGlyph } from "@/components/ui/glyphs";
import { PANEL, TH, TD, INPUT_FIND, BTN_GHOST, BTN_PRIMARY, LINK_ACT_GOLD, LINK_ACT_DANGER, clampPageSize } from "@/components/ui/controls";
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

const FILTER_SEL =
  "rounded-[9px] border border-line-strong bg-surface px-2.5 py-2 text-[12.5px] text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export type RechargeReportParams = {
  q?: string;
  from?: string;
  to?: string;
  mode?: string;
  status?: string;
  source?: string;
  operator?: string;
  page?: string;
  size?: string;
};

/** Recharge management, rendered inside the /reports tab shell. */
export async function RechargeReport({ actor, sp }: { actor: Actor; sp: RechargeReportParams }) {
  if (!can(actor, "recharge.view")) {
    return <p className="px-1 py-8 text-sm text-muted">You don&rsquo;t have access to recharges.</p>;
  }
  const canCreate = can(actor, "recharge.create");
  const canEdit = can(actor, "recharge.edit");
  const canReverse = can(actor, "recharge.delete");
  const canImport = can(actor, "recharge.import");

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = clampPageSize(sp.size, 25);

  // Filters (shared with the CSV export — services/reporting). The date range
  // applies only when explicitly set (default = all time).
  const filter = parseRechargeFilter(sp, actor.branchId ? BigInt(actor.branchId) : null);
  const where = rechargeWhere(filter);
  const q = filter.q ?? "";
  const hasRange = Boolean(filter.from);
  const range = resolveDateRange(sp.from, sp.to, new Date());
  const status = filter.status;
  const source = filter.source;
  const modeId = filter.paymentModeId;
  const operator = filter.operator === "self" ? "self" : filter.operator?.toString();
  const filtered = Boolean(q || hasRange || status || modeId || source || operator);

  // The export link carries the exact same filters.
  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries({ q: sp.q, from: sp.from, to: sp.to, mode: sp.mode, status: sp.status, source: sp.source, operator: sp.operator })) {
    if (v) csvQuery.set(k, v);
  }

  const [recharges, total, paymentModes, operators] = await Promise.all([
    prisma.recharge.findMany({
      where,
      include: { user: true, paymentMode: true, appUser: true, coupons: true },
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.recharge.count({ where }),
    prisma.paymentMode.findMany({ orderBy: { name: "asc" } }),
    // Only staff who actually posted a recharge — keeps the dropdown short.
    prisma.appUser.findMany({ where: { recharges: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">Grant meal coupons to a cardholder.</p>
        <div className="flex flex-wrap items-center gap-2.5">
          <a href={`/api/reports/recharges${csvQuery.size ? `?${csvQuery.toString()}` : ""}`} className={BTN_GHOST}>
            <DownloadGlyph />
            Export CSV
          </a>
          {canImport ? <RechargeImportModal /> : null}
          {canEdit ? <ExpirySweepButton /> : null}
        </div>
      </div>

      {canCreate ? <RechargeSearch /> : null}

      {/* Table filters: search + selects in one GET form; the date range lives in
          the shared popover, each re-emitting the other's params. */}
      <div className={`${PANEL} p-[14px_20px]`}>
        <div className="flex flex-wrap items-center gap-2.5">
          <form method="get" action="/reports" className="flex flex-1 flex-wrap items-center gap-2.5">
            <input type="hidden" name="tab" value="recharges" />
            {sp.from ? <input type="hidden" name="from" value={sp.from} /> : null}
            {sp.to ? <input type="hidden" name="to" value={sp.to} /> : null}
            <input
              name="q"
              defaultValue={q}
              placeholder="Search cardholder, txn ID, remarks…"
              aria-label="Search recharges"
              className={`${INPUT_FIND} min-w-[220px] flex-1 sm:max-w-[320px]`}
            />
            <select name="mode" defaultValue={modeId?.toString() ?? ""} aria-label="Payment mode" className={FILTER_SEL}>
              <option value="">All modes</option>
              {paymentModes.map((m) => (
                <option key={m.id.toString()} value={m.id.toString()}>{m.name}</option>
              ))}
            </select>
            <select name="status" defaultValue={status ?? ""} aria-label="Status" className={FILTER_SEL}>
              <option value="">Any status</option>
              <option value="posted">Posted</option>
              <option value="reversed">Reversed</option>
              <option value="expired">Expired</option>
            </select>
            <select name="source" defaultValue={source ?? ""} aria-label="Source" className={FILTER_SEL}>
              <option value="">Any source</option>
              <option value="online">Online (Jodo)</option>
              <option value="manual">Manual</option>
            </select>
            <select name="operator" defaultValue={operator ?? ""} aria-label="Operator" className={FILTER_SEL}>
              <option value="">Any operator</option>
              <option value="self">Self Recharge</option>
              {operators.map((o) => (
                <option key={o.id.toString()} value={o.id.toString()}>{o.name}</option>
              ))}
            </select>
            <button type="submit" className={BTN_PRIMARY}>Search</button>
            {filtered ? (
              <Link href="/reports?tab=recharges" className="px-2 text-[13px] font-medium text-muted transition-colors hover:text-ink-2">
                Clear
              </Link>
            ) : null}
          </form>
          <DateRangeForm
            action="/reports"
            fromStr={range.fromStr}
            toStr={range.toStr}
            hidden={{ tab: "recharges", q: q || undefined, mode: sp.mode, status: sp.status, source: sp.source, operator: sp.operator }}
            active={hasRange}
          />
        </div>
      </div>

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
                <tr><td colSpan={8} className="px-5 py-12 text-center text-muted">{filtered ? "No recharges match your filters." : "No recharges yet."}</td></tr>
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
