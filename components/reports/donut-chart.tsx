"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

const COLORS = ["var(--gold)", "var(--sage)", "var(--navy)", "var(--gold-deep)", "var(--sage-deep)", "var(--navy-text)"];

type Slice = { label: string; value: number; color?: string };

/**
 * Donut (Recharts) with a centre total + a swatch legend. Used for "cardholders
 * by category" (balances) and "taps by meal" (consumption). Pass a per-slice
 * `color` for stable mappings (e.g. meal colours); otherwise colours cycle
 * saffron → green → navy.
 */
export function DonutChart({ data, centerLabel }: { data: Slice[]; centerLabel: string }) {
  const colorAt = (d: Slice, i: number) => d.color ?? COLORS[i % COLORS.length];
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <div className="grid h-[132px] place-items-center text-sm text-muted">No data in this range.</div>;
  }
  return (
    <div className="flex items-center gap-5">
      <div className="relative size-[132px] shrink-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={44} outerRadius={62} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
              {data.map((d, i) => (
                <Cell key={i} fill={colorAt(d, i)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="font-display text-xl font-bold tabular-nums text-ink">{total.toLocaleString("en-IN")}</div>
            <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-2">{centerLabel}</div>
          </div>
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2 text-[12.5px]">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: colorAt(d, i) }} />
            <span className="min-w-0 flex-1 truncate text-muted">{d.label}</span>
            <span className="font-mono font-bold tabular-nums text-ink">{d.value.toLocaleString("en-IN")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
