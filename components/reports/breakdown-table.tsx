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

/**
 * Usage breakdown by some dimension (category / meal / counter). `mode="pl"`
 * shows sale / vendor cost / P&L; `mode="vendor"` shows only the vendor payable
 * (the vendor dashboard's caterer-facing view).
 */
export function BreakdownTable({
  title,
  unit,
  rows,
  mode = "pl",
}: {
  title: string;
  unit: string; // header for the dimension column, e.g. "Meal"
  rows: Breakdown[];
  mode?: "pl" | "vendor";
}) {
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
            <th className="px-4 py-2.5 font-semibold">{unit}</th>
            <th className="px-4 py-2.5 text-right font-semibold">Taps</th>
            {mode === "pl" ? (
              <>
                <th className="px-4 py-2.5 text-right font-semibold">Sale</th>
                <th className="px-4 py-2.5 text-right font-semibold">Vendor cost</th>
                <th className="px-4 py-2.5 text-right font-semibold">P&amp;L</th>
              </>
            ) : (
              <th className="px-4 py-2.5 text-right font-semibold">Vendor payable</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={mode === "pl" ? 5 : 3} className="px-4 py-8 text-center text-ink-2">
                No activity in this range.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id || r.label} className="border-t border-line">
                <td className="px-4 py-2.5 text-ink">{r.label}</td>
                <td className="px-4 py-2.5 text-right font-mono text-ink-2">{r.count}</td>
                {mode === "pl" ? (
                  <>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-2">{inr(r.sale)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink-2">{inr(r.cost)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <PL value={r.pl} />
                    </td>
                  </>
                ) : (
                  <td className="px-4 py-2.5 text-right font-mono text-ink">{inr(r.cost)}</td>
                )}
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 ? (
          <tfoot>
            <tr className="border-t border-line-strong bg-surface-2 font-semibold text-ink">
              <td className="px-4 py-2.5">Total</td>
              <td className="px-4 py-2.5 text-right font-mono">{totalCount}</td>
              {mode === "pl" ? (
                <>
                  <td className="px-4 py-2.5 text-right font-mono">{inr(sum(rows, (r) => r.sale))}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{inr(sum(rows, (r) => r.cost))}</td>
                  <td className="px-4 py-2.5 text-right">
                    <PL value={sum(rows, (r) => r.pl)} />
                  </td>
                </>
              ) : (
                <td className="px-4 py-2.5 text-right font-mono">{inr(sum(rows, (r) => r.cost))}</td>
              )}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
