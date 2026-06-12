"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AUDIT_KINDS, AUDIT_KIND_META, type AuditKind } from "@/lib/audit-kind";

export type AuditDayRow = { label: string } & Record<AuditKind, number>;

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value > 0);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[11px] shadow-lg">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {rows.map((r) => (
        <p key={r.dataKey} className={AUDIT_KIND_META[r.dataKey as AuditKind].text}>
          {AUDIT_KIND_META[r.dataKey as AuditKind].label}: {r.value}
        </p>
      ))}
    </div>
  );
}

/** Stacked bar: audit events per day, segmented by derived action kind. */
export function AuditDayBarChart({ data }: { data: AuditDayRow[] }) {
  const empty = data.every((d) => AUDIT_KINDS.every((k) => !d[k]));
  return (
    <div className="rounded-md border border-line bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-2.5 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="h-[17px] w-1 rounded-full bg-gold" />
          <h2 className="font-display text-base font-bold text-ink">Events per day</h2>
        </div>
        <span className="text-[11.5px] text-muted-2">by action type</span>
      </div>
      <div className="h-[230px] border-t border-line px-3 py-3">
        {empty ? (
          <div className="grid h-full place-items-center text-sm text-muted">No events in this range.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-2)" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--muted-2)" }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--gold-soft)", opacity: 0.5 }} />
              {AUDIT_KINDS.map((k) => (
                <Bar key={k} dataKey={k} stackId="a" fill={AUDIT_KIND_META[k].fill} maxBarSize={22} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-line px-5 py-3 text-[11.5px] text-muted">
        {AUDIT_KINDS.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: AUDIT_KIND_META[k].fill }} />
            {AUDIT_KIND_META[k].label}
          </span>
        ))}
      </div>
    </div>
  );
}
