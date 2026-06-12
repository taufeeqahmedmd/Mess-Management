"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
export type ChartPoint = { date: string; label: string; profit: number };

const inr0 = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-sm border border-line bg-surface px-2.5 py-1.5 shadow-lg">
      <p className="text-[11px] text-muted">{p.label}</p>
      <p className="font-mono text-sm font-semibold text-ink">{inr0(p.profit)}</p>
    </div>
  );
}

/**
 * Compact profit-trend card (Recharts) for the dashboard's stat row. Saffron
 * area + line, the range total shown in green. Pairs with the four KPI cards on
 * a single grid row. Honours the dashboard's date filter.
 */
export function ProfitAreaChart({ points, rangeLabel }: { points: ChartPoint[]; rangeLabel: string }) {
  const total = points.reduce((s, p) => s + p.profit, 0);
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-line bg-surface px-[19px] py-[18px] shadow-sm">
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-bold text-ink">Profit trend</h2>
          <p className="mt-0.5 text-[11px] text-muted-2">{rangeLabel}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-bold leading-none tabular-nums text-sage-deep">{inr0(total)}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.05em] text-muted-2">total in range</p>
        </div>
      </div>
      <div className="h-[150px] w-full">
        {points.length === 0 ? (
          <div className="flex h-full items-center justify-center py-8 text-sm text-ink-2">
            No profit data in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={120}>
            <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="dash-profit-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--gold-deep)", strokeOpacity: 0.4 }} />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="var(--gold)"
                strokeWidth={2.4}
                fill="url(#dash-profit-fill)"
                dot={false}
                activeDot={{ r: 3.4, fill: "var(--surface)", stroke: "var(--gold-deep)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
