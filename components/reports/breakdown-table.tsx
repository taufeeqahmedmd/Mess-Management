import { Prisma } from "@prisma/client";
import { inr } from "@/lib/format";
import type { Breakdown } from "@/services/reporting";

const sum = (rows: Breakdown[], pick: (r: Breakdown) => Prisma.Decimal) =>
  rows.reduce((s, r) => s.plus(pick(r)), new Prisma.Decimal(0));

/** Sign-coloured P/L value (never colour alone — the +/− sign carries it too). */
export function PL({ value }: { value: Breakdown["pl"] }) {
  const positive = !value.isNegative();
  return (
    <span className={`font-mono ${positive ? "text-sage-deep" : "text-tomato"}`}>
      {positive ? "+" : "−"}
      {inr(value.abs())}
    </span>
  );
}

const BAR: Record<"saffron" | "green" | "navy", string> = {
  saffron: "bg-gold",
  green: "bg-sage",
  navy: "bg-navy",
};

/**
 * Usage breakdown by some dimension (category / meal / counter). `mode="pl"`
 * shows sale / vendor cost / P&L; `mode="vendor"` shows only the vendor payable
 * (the vendor dashboard's caterer-facing view). An optional `accent` renders the
 * coloured panel bar before the title; `rowDot` prefixes each first-column label
 * with a saffron meal-chip dot.
 */
export function BreakdownTable({
  title,
  unit,
  rows,
  mode = "pl",
  accent,
  rowDot = false,
  dotColors,
}: {
  title: string;
  unit: string; // header for the dimension column, e.g. "Meal"
  rows: Breakdown[];
  mode?: "pl" | "vendor";
  accent?: "saffron" | "green" | "navy";
  rowDot?: boolean;
  /** Stable per-row dot colour keyed by row id (e.g. meal colours). */
  dotColors?: Record<string, string>;
}) {
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const th = "px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-2";
  const td = "px-5 py-3.5 font-mono text-ink-2";
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface shadow-sm">
      <div className="flex items-center gap-2.5 px-5 py-3.5">
        {accent ? <span className={`h-[17px] w-1 shrink-0 rounded-full ${BAR[accent]}`} /> : null}
        <h3 className="font-display text-base font-bold text-ink">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-y border-line bg-surface-2 text-left">
              <th className={th}>{unit}</th>
              <th className={`${th} text-right`}>Taps</th>
              {mode === "pl" ? (
                <>
                  <th className={`${th} text-right`}>Sale</th>
                  <th className={`${th} text-right`}>Vendor cost</th>
                  <th className={`${th} text-right`}>P&amp;L</th>
                </>
              ) : (
                <th className={`${th} text-right`}>Vendor payable</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={mode === "pl" ? 5 : 3} className="px-5 py-10 text-center text-muted">
                  No activity in this range.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id || r.label} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                  <td className="px-5 py-3.5 font-medium text-ink">
                    {rowDot ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`size-[7px] shrink-0 rounded-full ${dotColors ? "" : "bg-gold"}`}
                          style={dotColors ? { background: dotColors[r.id] ?? "var(--gold)" } : undefined}
                        />
                        {r.label}
                      </span>
                    ) : (
                      r.label
                    )}
                  </td>
                  <td className={`${td} text-right`}>{r.count}</td>
                  {mode === "pl" ? (
                    <>
                      <td className={`${td} text-right`}>{inr(r.sale)}</td>
                      <td className={`${td} text-right`}>{inr(r.cost)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <PL value={r.pl} />
                      </td>
                    </>
                  ) : (
                    <td className="px-5 py-3.5 text-right font-mono text-ink">{inr(r.cost)}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="border-t border-line-strong bg-surface-2 font-bold text-ink">
                <td className="px-5 py-3.5">Total</td>
                <td className="px-5 py-3.5 text-right font-mono">{totalCount}</td>
                {mode === "pl" ? (
                  <>
                    <td className="px-5 py-3.5 text-right font-mono">{inr(sum(rows, (r) => r.sale))}</td>
                    <td className="px-5 py-3.5 text-right font-mono">{inr(sum(rows, (r) => r.cost))}</td>
                    <td className="px-5 py-3.5 text-right">
                      <PL value={sum(rows, (r) => r.pl)} />
                    </td>
                  </>
                ) : (
                  <td className="px-5 py-3.5 text-right font-mono">{inr(sum(rows, (r) => r.cost))}</td>
                )}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
