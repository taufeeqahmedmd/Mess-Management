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

/** Compact ₹ for Y-axis ticks: ₹2k, ₹-1.5k, ₹900. */
const inrShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1000) {
    const k = n / 1000;
    return `₹${a % 1000 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `₹${n}`;
};

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
    <div className="flex h-full flex-col overflow-hidden rounded-md border border-line bg-surface px-[19px] py-[18px] shadow-sm">
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
      <div className="min-h-[220px] w-full flex-1">
        {points.length === 0 ? (
          <div className="flex h-full items-center justify-center py-8 text-sm text-ink-2">
            No profit data in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={120}>
            <AreaChart data={points} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
              <defs>
                {/* Horizontal saffron → sage: the line and fill flow warm-to-green
                    across the range, echoing the Tricolour theme. */}
                <linearGradient id="dash-profit-stroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--gold)" />
                  <stop offset="45%" stopColor="var(--gold)" />
                  <stop offset="70%" stopColor="var(--sage)" />
                  <stop offset="100%" stopColor="var(--sage-deep)" />
                </linearGradient>
                <linearGradient id="dash-profit-fill" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.22} />
                  <stop offset="45%" stopColor="var(--gold)" stopOpacity={0.16} />
                  <stop offset="70%" stopColor="var(--sage)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--sage)" stopOpacity={0.12} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--line)" strokeOpacity={0.7} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--muted)" }}
                minTickGap={18}
                interval="preserveStartEnd"
                dy={4}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--muted)" }}
                width={40}
                tickFormatter={inrShort}
                domain={["auto", "auto"]}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--ink-2)", strokeOpacity: 0.3 }} />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="url(#dash-profit-stroke)"
                strokeWidth={2.4}
                fill="url(#dash-profit-fill)"
                dot={false}
                activeDot={{ r: 3.4, fill: "var(--surface)", stroke: "var(--sage-deep)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
