import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { type Actor } from "@/lib/rbac";
import { StatCard } from "@/components/ui/stat-card";
import { DateRangeForm } from "@/components/reports/date-range-form";
import { AuditDayBarChart, type AuditDayRow } from "@/components/reports/audit-day-chart";
import { Pager } from "@/components/ui/pager";
import { ReceiptIcon, UsersIcon, TrendingUpIcon, BankIcon } from "@/components/reports/stat-icons";
import { BTN_GHOST, PANEL, TH, TD, clampPageSize } from "@/components/ui/controls";
import { DownloadGlyph } from "@/components/ui/glyphs";
import { resolveDateRange } from "@/services/reporting";
import { auditKind, AUDIT_KINDS, AUDIT_KIND_META, type AuditKind } from "@/lib/audit-kind";

export type AuditParams = { from?: string; to?: string; entity?: string; kind?: string; page?: string; size?: string };

const SELECT =
  "rounded-sm border border-line-strong bg-surface px-3.5 py-2 text-[13px] text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

function changedKeys(before: unknown, after: unknown): string[] {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  return [...keys].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Audit-log report body — rendered inside the /reports tab shell. */
export async function AuditReport({ actor, sp }: { actor: Actor; sp: AuditParams }) {
  const range = resolveDateRange(sp.from, sp.to, new Date());
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = clampPageSize(sp.size, 25);
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;
  const entity = (sp.entity ?? "").trim();
  const kind = (AUDIT_KINDS as string[]).includes(sp.kind ?? "") ? (sp.kind as AuditKind) : undefined;

  const baseWhere: Prisma.AuditLogWhereInput = {
    createdAt: { gte: range.from, lt: range.toExclusive },
    ...(entity ? { entity } : {}),
    ...(branchId ? { appUser: { is: { branchId } } } : {}),
  };

  const actionGroups = await prisma.auditLog.groupBy({ by: ["action"], where: baseWhere, _count: { _all: true } });
  const matchingActions = kind ? actionGroups.map((g) => g.action).filter((a) => auditKind(a) === kind) : null;
  const where: Prisma.AuditLogWhereInput = matchingActions
    ? { ...baseWhere, action: { in: matchingActions.length > 0 ? matchingActions : [" none"] } }
    : baseWhere;

  const [entities, rows, meta] = await Promise.all([
    prisma.auditLog.groupBy({ by: ["entity"], where: baseWhere, orderBy: { entity: "asc" } }),
    prisma.auditLog.findMany({ where, include: { appUser: true }, orderBy: { id: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.auditLog.findMany({ where, select: { createdAt: true, action: true, appUserId: true } }),
  ]);

  const total = meta.length;
  const activeActors = new Set(meta.filter((m) => m.appUserId != null).map((m) => m.appUserId!.toString())).size;
  const kindCount = (k: AuditKind) => meta.filter((m) => auditKind(m.action) === k).length;

  const actionTally = new Map<string, number>();
  for (const m of meta) actionTally.set(m.action, (actionTally.get(m.action) ?? 0) + 1);
  const topActions = [...actionTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topMax = Math.max(1, ...topActions.map(([, n]) => n));

  const spanDays = Math.max(1, Math.round((range.toExclusive.getTime() - range.from.getTime()) / 86_400_000));
  const monthly = spanDays > 62;
  const keyOf = (d: Date) => (monthly ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : ymd(d));
  const labelOf = (d: Date) => (monthly ? d.toLocaleDateString("en-IN", { month: "short" }) : String(d.getDate()));
  const blank = (): AuditDayRow => ({ label: "", create: 0, update: 0, delete: 0, security: 0, other: 0 });
  const buckets = new Map<string, AuditDayRow>();
  const cursor = monthly ? new Date(range.from.getFullYear(), range.from.getMonth(), 1) : startOfDay(range.from);
  while (cursor < range.toExclusive) {
    buckets.set(keyOf(cursor), { ...blank(), label: labelOf(cursor) });
    if (monthly) cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  for (const m of meta) {
    const b = buckets.get(keyOf(m.createdAt));
    if (b) b[auditKind(m.action)] += 1;
  }
  const dayRows = [...buckets.values()];

  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries({ from: range.fromStr, to: range.toStr, entity, kind })) if (v) csvQuery.set(k, v);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">{total.toLocaleString("en-IN")} events · {range.fromStr} → {range.toStr}</p>
        <a href={`/api/reports/audit?${csvQuery.toString()}`} className={BTN_GHOST}>
          <DownloadGlyph />
          Export CSV
        </a>
      </div>

      <div className={`${PANEL} p-[16px_20px]`}>
        <DateRangeForm action="/reports" fromStr={range.fromStr} toStr={range.toStr} hidden={{ tab: "audit" }}>
          <select name="entity" defaultValue={entity} aria-label="Entity" className={SELECT}>
            <option value="">All entities</option>
            {entities.map((e) => <option key={e.entity} value={e.entity}>{e.entity}</option>)}
          </select>
          <select name="kind" defaultValue={kind ?? ""} aria-label="Action type" className={SELECT}>
            <option value="">All actions</option>
            {AUDIT_KINDS.map((k) => <option key={k} value={k}>{AUDIT_KIND_META[k].label}</option>)}
          </select>
        </DateRangeForm>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Events" value={total.toLocaleString("en-IN")} hint="in selected range" variant="plain" icon={<ReceiptIcon />} />
        <StatCard label="Active actors" value={activeActors.toLocaleString("en-IN")} hint="distinct staff / admins" variant="navy" icon={<UsersIcon />} />
        <StatCard label="Updates" value={kindCount("update").toLocaleString("en-IN")} hint="config & permission changes" variant="saffron" icon={<TrendingUpIcon />} />
        <StatCard label="Security events" value={kindCount("security").toLocaleString("en-IN")} hint="logins & password changes" variant="green" icon={<BankIcon />} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:[grid-template-columns:2fr_1fr]">
        <AuditDayBarChart data={dayRows} />
        <div className={PANEL}>
          <div className="flex items-center gap-2.5 px-5 py-3.5">
            <span className="h-[17px] w-1 rounded-full bg-sage" />
            <h2 className="font-display text-base font-bold text-ink">Top actions</h2>
          </div>
          <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
            {topActions.length === 0 ? (
              <p className="text-sm text-muted">No events in this range.</p>
            ) : (
              topActions.map(([action, n]) => (
                <div key={action}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="truncate font-mono text-ink-2">{action}</span>
                    <span className="font-mono font-bold text-ink">{n}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-gold" style={{ width: `${(n / topMax) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>When</th>
                <th className={TH}>Actor</th>
                <th className={TH}>Action</th>
                <th className={TH}>Entity</th>
                <th className={TH}>Changed</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-muted">No audit events in this range.</td></tr>
              ) : (
                rows.map((r) => {
                  const keys = changedKeys(r.beforeJson, r.afterJson);
                  const k = auditKind(r.action);
                  const name = r.appUser?.name ?? "system";
                  return (
                    <tr key={r.id.toString()} className="border-b border-line align-middle transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} whitespace-nowrap font-mono text-[12.5px] text-muted`}>{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <span className="inline-flex items-center gap-2.5">
                          <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--gold),var(--sage))] text-[10.5px] font-bold text-white">{name.slice(0, 1).toUpperCase()}</span>
                          <span className="font-medium text-ink">{name}</span>
                        </span>
                      </td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-1.5 font-mono text-[12.5px] ${AUDIT_KIND_META[k].text}`}>
                          <span className={`size-1.5 rounded-full ${AUDIT_KIND_META[k].dot}`} />{r.action}
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <span className="font-medium text-ink">{r.entity}</span>
                        {r.entityId != null ? <span className="ml-1.5 font-mono text-[12px] text-muted-2">#{r.entityId.toString()}</span> : null}
                      </td>
                      <td className={TD}>
                        {keys.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {keys.map((key) => <span key={key} className="rounded-[6px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{key}</span>)}
                          </span>
                        ) : (
                          <span className="text-muted-2">—</span>
                        )}
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
