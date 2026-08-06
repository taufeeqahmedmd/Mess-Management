import { Prisma } from "@prisma/client";
import { inr } from "@/lib/format";
import type { DayUsage } from "@/services/reporting";

const ZERO = new Prisma.Decimal(0);

function weekday(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short" });
}

/**
 * Day-wise vendor-payable table for a settlement period: one row per day with
 * taps + payable, split into a column per meal when the window has more than
 * one meal. Days without activity are omitted.
 */
export function DayBreakdownTable({ title, data }: { title: string; data: DayUsage }) {
  const { meals, days } = data;
  const showMealCols = meals.length > 1;
  const totalCount = days.reduce((s, d) => s + d.count, 0);
  const totalCost = days.reduce((s, d) => s.plus(d.cost), ZERO);
  const mealTotals = meals.map((m) => ({
    count: days.reduce((s, d) => s + (d.byMeal[m.id]?.count ?? 0), 0),
    cost: days.reduce((s, d) => s.plus(d.byMeal[m.id]?.cost ?? ZERO), ZERO),
  }));

  const th = "px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-2 sm:px-5";
  const td = "px-3 py-3.5 font-mono text-ink-2 sm:px-5";
  const colSpan = 3 + (showMealCols ? meals.length : 0);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface shadow-sm">
      <div className="flex items-center gap-2.5 px-5 py-3.5">
        <h3 className="font-display text-base font-bold text-ink">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-y border-line bg-surface-2 text-left">
              <th className={th}>Date</th>
              {showMealCols
                ? meals.map((m) => (
                    <th key={m.id || "none"} className={`${th} text-right`}>
                      {m.label}
                    </th>
                  ))
                : null}
              <th className={`${th} text-right`}>Taps</th>
              <th className={`${th} text-right`}>Vendor payable</th>
            </tr>
          </thead>
          <tbody>
            {days.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-10 text-center text-muted sm:px-5">
                  No activity in this range.
                </td>
              </tr>
            ) : (
              days.map((d) => (
                <tr key={d.date} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-3.5 font-medium text-ink sm:px-5">
                    <span className="font-mono">{d.date}</span>
                    <span className="ml-2 text-xs text-muted">{weekday(d.date)}</span>
                  </td>
                  {showMealCols
                    ? meals.map((m) => {
                        const cell = d.byMeal[m.id];
                        return (
                          <td key={m.id || "none"} className={`${td} text-right`}>
                            {cell ? (
                              <>
                                <div>{cell.count}</div>
                                <div className="text-[11px] text-ink-2">{inr(cell.cost)}</div>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })
                    : null}
                  <td className={`${td} text-right`}>{d.count}</td>
                  <td className="px-3 py-3.5 text-right font-mono text-ink sm:px-5">{inr(d.cost)}</td>
                </tr>
              ))
            )}
          </tbody>
          {days.length > 0 ? (
            <tfoot>
              <tr className="border-t border-line-strong bg-surface-2 font-bold text-ink">
                <td className="px-3 py-3.5 sm:px-5">Total</td>
                {showMealCols
                  ? mealTotals.map((t, i) => (
                      <td key={meals[i].id || "none"} className="px-3 py-3.5 text-right font-mono sm:px-5">
                        <div>{t.count}</div>
                        <div className="text-[11px]">{inr(t.cost)}</div>
                      </td>
                    ))
                  : null}
                <td className="px-3 py-3.5 text-right font-mono sm:px-5">{totalCount}</td>
                <td className="px-3 py-3.5 text-right font-mono sm:px-5">{inr(totalCost)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
