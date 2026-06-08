import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { DateRangeForm } from "@/components/reports/date-range-form";
import { resolveDateRange } from "@/services/reporting";

const PAGE_SIZE = 30;

const SELECT =
  "rounded-sm border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

/** Changed top-level keys between before/after JSON, for an at-a-glance diff. */
function changedKeys(before: unknown, after: unknown): string[] {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  return [...keys].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; entity?: string; page?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "reports.view")) redirect("/dashboard");

  const sp = await searchParams;
  const range = resolveDateRange(sp.from, sp.to, new Date());
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;
  const entity = (sp.entity ?? "").trim();

  const where: Prisma.AuditLogWhereInput = {
    createdAt: { gte: range.from, lt: range.toExclusive },
    ...(entity ? { entity } : {}),
    ...(branchId ? { appUser: { is: { branchId } } } : {}),
  };

  const [entities, total, rows] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { appUser: true },
      orderBy: { id: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageLink = (p: number) => {
    const qp = new URLSearchParams();
    for (const [k, v] of Object.entries({ from: range.fromStr, to: range.toStr, entity, page: String(p) }))
      if (v) qp.set(k, v);
    return `/reports/audit?${qp.toString()}`;
  };

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-xs text-ink-2 transition-colors hover:text-gold-deep">
            ← Reports
          </Link>
          <h1 className="font-display text-2xl font-semibold text-ink">Audit log</h1>
          <p className="mt-1 text-sm text-ink-2">
            {total.toLocaleString("en-IN")} events · {range.fromStr} → {range.toStr}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-line bg-surface p-4">
        <DateRangeForm action="/reports/audit" fromStr={range.fromStr} toStr={range.toStr}>
          <select name="entity" defaultValue={entity} aria-label="Entity" className={SELECT}>
            <option value="">All entities</option>
            {entities.map((e) => (
              <option key={e.entity} value={e.entity}>{e.entity}</option>
            ))}
          </select>
        </DateRangeForm>
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Actor</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Entity</th>
              <th className="px-4 py-3 font-semibold">Changed</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-2">No audit events in this range.</td>
              </tr>
            ) : (
              rows.map((r) => {
                const keys = changedKeys(r.beforeJson, r.afterJson);
                return (
                  <tr key={r.id.toString()} className="border-t border-line align-top">
                    <td className="px-4 py-3 font-mono text-xs text-ink-2">
                      {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{r.appUser?.name ?? "system"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink">{r.action}</td>
                    <td className="px-4 py-3 text-ink-2">
                      {r.entity}
                      {r.entityId != null ? <span className="ml-1 font-mono text-xs text-muted">#{r.entityId.toString()}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{keys.length > 0 ? keys.join(", ") : "—"}</td>
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
            {page > 1 ? (
              <Link href={pageLink(page - 1)} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">Previous</Link>
            ) : null}
            {page < totalPages ? (
              <Link href={pageLink(page + 1)} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">Next</Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
