"use client";

import { useRef, useState } from "react";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, BTN_GHOST } from "@/components/ui/controls";
import { PlusGlyph } from "@/components/ui/glyphs";
import { saveRatesAction, type RatesEditorState } from "./counter-rate-actions";

type Item = { id: string; name: string };
type Cell = { charge: string; vendor: string };
type Row = { key: string; mealId: string; cells: Record<string, Cell> };
export type InitialRow = { mealId: string; cells: Record<string, Cell> };

const initial: RatesEditorState = {};

const selectCls =
  "w-full min-w-36 rounded-sm border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20 disabled:opacity-60";

/** A single ₹-prefixed rate input, tinted saffron (sale) or green (cost). */
function RateField({
  kind,
  value,
  onChange,
  ariaLabel,
}: {
  kind: "sale" | "cost";
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const tint = kind === "sale" ? "border-gold-soft-2 bg-gold-soft" : "border-sage-soft-2 bg-sage-soft";
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-2">₹</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        placeholder={kind === "sale" ? "Charge" : "Vendor"}
        className={`w-24 rounded-[9px] border ${tint} py-1.5 pl-[18px] pr-2.5 text-right font-mono text-[13px] tabular-nums text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20`}
      />
    </div>
  );
}

export function RatesEditor({
  branchId,
  meals,
  categories,
  initialRows,
}: {
  branchId: string;
  meals: Item[];
  categories: Item[];
  initialRows: InitialRow[];
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const src = initialRows.length ? initialRows : [{ mealId: "", cells: {} }];
    return src.map((r, i) => ({ key: `r${i}`, ...r }));
  });
  const keyRef = useRef(rows.length);
  const blankRow = (): Row => ({ key: `r${keyRef.current++}`, mealId: "", cells: {} });

  const { state, onSubmit, pending } = useConfirmedAction(saveRatesAction, initial, {
    confirm: {
      title: "Save rates",
      message: "Save the rate rows? This replaces the current rate set for this branch.",
      confirmLabel: "Yes, save",
    },
    successMessage: "Rates saved.",
  });

  const mealName = Object.fromEntries(meals.map((m) => [m.id, m.name]));

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

  // Rates are per branch × meal × category — no counter scope. counterIds is
  // omitted, so the save action records each row as a branch-default rate.
  const payload = JSON.stringify(rows.map((r) => ({ mealId: r.mealId, cells: r.cells })));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="rows" value={payload} />

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">{state.error}</p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm border border-sage-soft-2 bg-sage-soft px-3 py-2.5 text-[12.5px] font-medium text-sage-deep">Rates saved.</p>
      ) : null}

      {/* Meal is frozen (sticky-left); category columns scroll. */}
      <div className="overflow-x-auto rounded-md border border-line bg-surface shadow-sm">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left">
              <th className="sticky left-0 z-20 w-44 min-w-44 border-b border-r border-line bg-surface-2 px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-2">Meal</th>
              {categories.map((c) => (
                <th key={c.id} className="min-w-[120px] border-b border-line bg-surface-2 px-3 py-2.5 text-right text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-2">{c.name}</th>
              ))}
              <th className="border-b border-line bg-surface-2 px-3 py-2.5" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={categories.length + 2} className="px-5 py-10 text-center text-muted">
                  No rows. Add one to set a rate.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key}>
                  <td className="sticky left-0 z-10 w-44 min-w-44 border-b border-r border-line bg-surface px-5 py-3.5">
                    <select value={row.mealId} onChange={(e) => setMeal(row.key, e.target.value)} aria-label="Meal" className={selectCls}>
                      <option value="">Select meal…</option>
                      {meals.map((m) => (
                        <option key={m.id} value={m.id}>{mealName[m.id]}</option>
                      ))}
                    </select>
                  </td>
                  {categories.map((c) => {
                    const cell = row.cells[c.id] ?? { charge: "", vendor: "" };
                    return (
                      <td key={c.id} className="border-b border-line px-3 py-3.5">
                        <div className="flex flex-col items-end gap-1.5">
                          <RateField kind="sale" value={cell.charge} onChange={(v) => setCell(row.key, c.id, "charge", v)} ariaLabel={`${c.name} charge`} />
                          <RateField kind="cost" value={cell.vendor} onChange={(v) => setCell(row.key, c.id, "vendor", v)} ariaLabel={`${c.name} vendor`} />
                        </div>
                      </td>
                    );
                  })}
                  <td className="border-b border-line px-3 py-3.5 align-top">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      aria-label="Remove row"
                      className="grid size-7 place-items-center rounded-sm text-muted transition-colors hover:bg-tomato-soft hover:text-tomato"
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-gold" />Sale (charge)</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-sage" />Vendor (cost)</span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : "Save rates"}
        </button>
        <button type="button" onClick={addRow} className={BTN_GHOST}>
          <PlusGlyph />
          Add row
        </button>
      </div>

      <p className="text-[11.5px] leading-relaxed text-muted-2">
        One row per meal, priced across categories — these rates apply to the whole branch. Blank
        category cells set no rate. Saving replaces this branch&rsquo;s current rates with the rows above.
      </p>
    </form>
  );
}
