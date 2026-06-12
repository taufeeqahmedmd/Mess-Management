"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SaleVendorPoint } from "@/services/reporting";

function shortInr(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `₹${(a / 1e3).toFixed(1)}k`;
  return `₹${Math.round(a)}`;
}
const inr2 = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const sale = payload.find((p) => p.dataKey === "sale")?.value ?? 0;
  const vendor = payload.find((p) => p.dataKey === "vendor")?.value ?? 0;
  return (
    <div className="rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[11px] shadow-lg">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      <p className="text-gold-deep">Sale {inr2(sale)}</p>
      <p className="text-sage-deep">Vendor {inr2(vendor)}</p>
    </div>
  );
}

/** Grouped bar chart: sale (saffron) vs vendor payable (green) per day. */
export function SaleVendorBarChart({ data }: { data: SaleVendorPoint[] }) {
  const empty = data.every((d) => d.sale === 0 && d.vendor === 0);
  return (
    <div className="rounded-md border border-line bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-2.5 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="h-[17px] w-1 rounded-full bg-gold" />
          <h2 className="font-display text-base font-bold text-ink">Sale vs vendor by day</h2>
        </div>
        <div className="flex items-center gap-3.5 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-gold" />Sale</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-sage" />Vendor</span>
        </div>
      </div>
      <div className="h-[240px] border-t border-line px-3 py-3">
        {empty ? (
          <div className="grid h-full place-items-center text-sm text-muted">No taps in this range.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-2)" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={shortInr} tick={{ fontSize: 10, fill: "var(--muted-2)" }} axisLine={false} tickLine={false} width={46} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--gold-soft)", opacity: 0.5 }} />
              <Bar dataKey="sale" fill="var(--gold)" radius={[3, 3, 0, 0]} maxBarSize={16} />
              <Bar dataKey="vendor" fill="var(--sage)" radius={[3, 3, 0, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
