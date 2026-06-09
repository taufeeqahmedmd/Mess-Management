"use client";

import { useRef, useState } from "react";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { saveCounterRatesAction, type CounterRateState } from "./counter-rate-actions";

type Item = { id: string; name: string };
type CounterItem = { id: string; name: string; code: string };
type Cell = { charge: string; vendor: string };
type Row = { key: string; counterId: string; mealId: string; cells: Record<string, Cell> };
export type InitialRow = { counterId: string; mealId: string; cells: Record<string, Cell> };

const initial: CounterRateState = {};

const selectCls =
  "min-w-36 rounded-sm border border-line-strong bg-surface-2 px-2 py-1.5 text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20 disabled:opacity-60";
const cellInput =
  "w-20 rounded-sm border border-line-strong bg-surface-2 px-2 py-1 text-right font-mono text-sm text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function CounterRatesEditor({
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
    const src = initialRows.length ? initialRows : [{ counterId: "", mealId: "", cells: {} }];
    return src.map((r, i) => ({ key: `r${i}`, ...r }));
  });
  // Next key counter starts after the initial rows; only bumped in event handlers.
  const keyRef = useRef(rows.length);
  const blankRow = (): Row => ({ key: `r${keyRef.current++}`, counterId: "", mealId: "", cells: {} });

  const { state, onSubmit, pending } = useConfirmedAction(saveCounterRatesAction, initial, {
    confirm: {
      title: "Save counter rates",
      message: "Save these per-counter rates? This replaces the current set of per-counter overrides.",
      confirmLabel: "Yes, save",
    },
    successMessage: "Counter rates saved.",
  });

  const mealName = Object.fromEntries(meals.map((m) => [m.id, m.name]));

  function setCounter(key: string, counterId: string) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const allowed = new Set(mealsByCounter[counterId] ?? []);
        return { ...r, counterId, mealId: allowed.has(r.mealId) ? r.mealId : "" };
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

  const payload = JSON.stringify(rows.map((r) => ({ counterId: r.counterId, mealId: r.mealId, cells: r.cells })));

  if (counters.length === 0) {
    return (
      <p className="rounded-sm bg-gold-soft px-3 py-2.5 text-sm text-ink-2">
        No active counters yet. Create counters under Settings → Counters first.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="rows" value={payload} />

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">{state.error}</p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm bg-sage-soft px-3 py-2.5 text-sm text-sage-deep">Counter rates saved.</p>
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
                  No rows. Add one to set a counter rate.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const availMeals = (mealsByCounter[row.counterId] ?? []).map((id) => ({ id, name: mealName[id] }));
                return (
                  <tr key={row.key} className="border-t border-line align-top">
                    <td className="px-3 py-3">
                      <select value={row.counterId} onChange={(e) => setCounter(row.key, e.target.value)} aria-label="Counter" className={selectCls}>
                        <option value="">Select counter…</option>
                        {counters.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={row.mealId}
                        onChange={(e) => setMeal(row.key, e.target.value)}
                        disabled={!row.counterId}
                        aria-label="Meal"
                        className={selectCls}
                      >
                        <option value="">{row.counterId ? "Select meal…" : "Pick a counter"}</option>
                        {availMeals.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </td>
                    {categories.map((c) => {
                      const cell = row.cells[c.id] ?? { charge: "", vendor: "" };
                      return (
                        <td key={c.id} className="px-2 py-3">
                          <div className="flex flex-col gap-1">
                            <input
                              inputMode="decimal"
                              placeholder="Charge"
                              value={cell.charge}
                              onChange={(e) => setCell(row.key, c.id, "charge", e.target.value)}
                              aria-label={`${c.name} charge`}
                              className={cellInput}
                            />
                            <input
                              inputMode="decimal"
                              placeholder="Vendor"
                              value={cell.vendor}
                              onChange={(e) => setCell(row.key, c.id, "vendor", e.target.value)}
                              aria-label={`${c.name} vendor`}
                              className={cellInput}
                            />
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
          type="button"
          onClick={addRow}
          className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep"
        >
          + Add row
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save counter rates"}
        </button>
      </div>

      <p className="text-xs text-muted">
        Each row sets a counter&rsquo;s rate for one meal across categories. The meal list shows only
        meals that counter serves. Leave a category blank to fall back to the default rate. Saving
        replaces the current per-counter overrides with these rows.
      </p>
    </form>
  );
}
