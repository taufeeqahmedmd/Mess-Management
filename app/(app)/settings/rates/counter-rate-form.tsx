"use client";

import { useState } from "react";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { saveCounterRateAction, type CounterRateState } from "./counter-rate-actions";

type Item = { id: string; name: string };
type CounterItem = { id: string; name: string; code: string };

const initial: CounterRateState = {};

const field =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function CounterRateForm({
  meals,
  categories,
  counters,
  mealCounters,
}: {
  meals: Item[];
  categories: Item[];
  counters: CounterItem[];
  mealCounters: Record<string, string[]>;
}) {
  const [mealId, setMealId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [charge, setCharge] = useState("");
  const [vendor, setVendor] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Only counters that serve the chosen meal (from counter_meals).
  const available = mealId ? counters.filter((c) => (mealCounters[mealId] ?? []).includes(c.id)) : [];
  const allSelected = available.length > 0 && available.every((c) => selected.has(c.id));

  const { state, onSubmit, pending } = useConfirmedAction(saveCounterRateAction, initial, {
    confirm: {
      title: "Save counter rate",
      message: "Apply this charge and vendor rate to the selected counters?",
      confirmLabel: "Yes, save",
    },
    successMessage: "Counter rates saved.",
  });

  function onMealChange(id: string) {
    setMealId(id);
    const avail = new Set(mealCounters[id] ?? []);
    setSelected((prev) => new Set([...prev].filter((x) => avail.has(x)))); // drop now-unavailable picks
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(available.map((c) => c.id)));
  }

  const canSubmit = Boolean(mealId && categoryId && charge && vendor && selected.size > 0);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-md border border-line bg-surface p-4 sm:p-5">
      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">{state.error}</p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm bg-sage-soft px-3 py-2.5 text-sm text-sage-deep">Counter rates saved.</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-2">Meal</span>
          <select name="mealId" value={mealId} onChange={(e) => onMealChange(e.target.value)} className={field}>
            <option value="">Select a meal…</option>
            {meals.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-2">Category</span>
          <select name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={field}>
            <option value="">Select a category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold text-ink-2">Counters</legend>
        {!mealId ? (
          <p className="text-sm text-ink-2">Pick a meal to choose the counters that serve it.</p>
        ) : available.length === 0 ? (
          <p className="rounded-sm bg-gold-soft px-3 py-2.5 text-sm text-ink-2">
            No counters serve this meal yet. Assign it under Settings → Meals first.
          </p>
        ) : (
          <>
            <label className="flex items-center gap-3 rounded-sm border border-line-strong bg-surface-2 px-3 py-2 text-sm font-medium text-ink">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="size-4 accent-gold" />
              Select all ({available.length})
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {available.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-3 rounded-sm border border-line bg-surface px-3 py-2.5 text-sm has-[:checked]:border-gold"
                >
                  <input
                    type="checkbox"
                    name="counters"
                    value={c.id}
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="size-4 shrink-0 accent-gold"
                  />
                  <span className="text-ink">{c.name}</span>
                  <span className="ml-auto font-mono text-xs text-muted">{c.code}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-2">Charge (sale) ₹</span>
          <input
            name="charge"
            value={charge}
            onChange={(e) => setCharge(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className={`${field} text-right font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-2">Vendor (cost) ₹</span>
          <input
            name="vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className={`${field} text-right font-mono`}
          />
        </label>
      </div>

      <div>
        <button
          type="submit"
          disabled={pending || !canSubmit}
          className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : `Save rate${selected.size > 1 ? ` (${selected.size} counters)` : ""}`}
        </button>
      </div>
    </form>
  );
}
