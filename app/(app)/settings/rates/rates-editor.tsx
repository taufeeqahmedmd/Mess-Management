"use client";

import { useRef, useState } from "react";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { CounterMultiSelect } from "./counter-multi-select";
import { saveRatesAction, type RatesEditorState } from "./counter-rate-actions";

type Item = { id: string; name: string };
type CounterItem = { id: string; name: string; code: string };
type Cell = { charge: string; vendor: string };
type Row = { key: string; counterIds: string[]; mealId: string; cells: Record<string, Cell> };
export type InitialRow = { counterIds: string[]; mealId: string; cells: Record<string, Cell> };

const initial: RatesEditorState = {};

const selectCls =
  "min-w-36 rounded-sm border border-line-strong bg-surface-2 px-2 py-1.5 text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20 disabled:opacity-60";
const cellInput =
  "w-20 rounded-sm border border-line-strong bg-surface-2 px-2 py-1 text-right font-mono text-sm text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function RatesEditor({
  branchId,
  counters,
  meals,
  categories,
  mealsByCounter,
  initialRows,
}: {
  branchId: string;
  counters: CounterItem[];
  meals: Item[];
  categories: Item[];
  mealsByCounter: Record<string, string[]>; // counterId → mealId[]
  initialRows: InitialRow[];
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const src = initialRows.length ? initialRows : [{ counterIds: [], mealId: "", cells: {} }];
    return src.map((r, i) => ({ key: `r${i}`, ...r }));
  });
  const keyRef = useRef(rows.length);
  const blankRow = (): Row => ({ key: `r${keyRef.current++}`, counterIds: [], mealId: "", cells: {} });

  const { state, onSubmit, pending } = useConfirmedAction(saveRatesAction, initial, {
    confirm: {
      title: "Save rates",
      message: "Save the rate rows? This replaces the current rate set for this branch.",
      confirmLabel: "Yes, save",
    },
    successMessage: "Rates saved.",
  });

  const mealName = Object.fromEntries(meals.map((m) => [m.id, m.name]));
  const counterOptions = counters.map((c) => ({ id: c.id, label: c.name, sub: c.code }));

  // Meals a row may pick: all when no counter chosen (a default row), else the
  // union of the selected counters' served meals.
  function mealsForRow(counterIds: string[]): Item[] {
    if (counterIds.length === 0) return meals;
    const ids = new Set<string>();
    for (const cid of counterIds) for (const mid of mealsByCounter[cid] ?? []) ids.add(mid);
    return meals.filter((m) => ids.has(m.id));
  }

  function setCounters(key: string, counterIds: string[]) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const allowed = new Set(mealsForRow(counterIds).map((m) => m.id));
        const mealId = !r.mealId || allowed.has(r.mealId) ? r.mealId : "";
        return { ...r, counterIds, mealId };
      }),
    );
  }
  function setMeal(key: string, mealId: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, mealId } : r)));
  }
  function setCell(key: string, catId: string, field: keyof Cell, value: string) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const existing = r.cells[catId] ?? { charge: "", vendor: "" };
        return { ...r, cells: { ...r.cells, [catId]: { ...existing, [field]: value } } };
      }),
    );
  }
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const payload = JSON.stringify(rows.map((r) => ({ counterIds: r.counterIds, mealId: r.mealId, cells: r.cells })));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="rows" value={payload} />

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">{state.error}</p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm bg-sage-soft px-3 py-2.5 text-sm text-sage-deep">Rates saved.</p>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-3 py-3 font-semibold">Counter</th>
              <th className="px-3 py-3 font-semibold">Meal</th>
              {categories.map((c) => (
                <th key={c.id} className="px-2 py-3 text-center font-semibold">{c.name}</th>
              ))}
              <th className="px-2 py-3" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={categories.length + 3} className="px-4 py-8 text-center text-ink-2">
                  No rows. Add one to set a rate.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const availMeals = mealsForRow(row.counterIds);
                return (
                  <tr key={row.key} className="border-t border-line align-top">
                    <td className="px-3 py-3">
                      <CounterMultiSelect
                        options={counterOptions}
                        selected={row.counterIds}
                        onChange={(next) => setCounters(row.key, next)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select value={row.mealId} onChange={(e) => setMeal(row.key, e.target.value)} aria-label="Meal" className={selectCls}>
                        <option value="">Select meal…</option>
                        {availMeals.map((m) => (
                          <option key={m.id} value={m.id}>{mealName[m.id]}</option>
                        ))}
                      </select>
                    </td>
                    {categories.map((c) => {
                      const cell = row.cells[c.id] ?? { charge: "", vendor: "" };
                      return (
                        <td key={c.id} className="px-2 py-3">
                          <div className="flex flex-col gap-1">
                            <input inputMode="decimal" placeholder="Charge" value={cell.charge} onChange={(e) => setCell(row.key, c.id, "charge", e.target.value)} aria-label={`${c.name} charge`} className={cellInput} />
                            <input inputMode="decimal" placeholder="Vendor" value={cell.vendor} onChange={(e) => setCell(row.key, c.id, "vendor", e.target.value)} aria-label={`${c.name} vendor`} className={cellInput} />
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        aria-label="Remove row"
                        className="grid size-7 place-items-center rounded-sm text-tomato transition-colors hover:bg-tomato-soft"
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save rates"}
        </button>
        <button
          type="button"
          onClick={addRow}
          className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep"
        >
          + Add row
        </button>
      </div>

      <p className="text-xs text-muted">
        Leave <span className="font-medium">Counter</span> empty for the branch default (applies where
        no counter-specific rate exists), or pick one or more counters to override them. The meal list
        shows meals the chosen counters serve. Blank category cells fall back to the default. Saving
        replaces this branch&rsquo;s current rates with the rows above.
      </p>
    </form>
  );
}
