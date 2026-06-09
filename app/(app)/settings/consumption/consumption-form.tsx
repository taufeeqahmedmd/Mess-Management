"use client";

import { useState } from "react";
import { MultiSelect } from "@/components/ui/multi-select";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { saveConsumptionAction, type ConsumptionState } from "./actions";

export type ConsumptionRow = {
  id: string;
  name: string;
  models: ("wallet" | "coupon")[];
  duplicateWindow: number;
  restrictMealSession: boolean;
};

const initial: ConsumptionState = {};

const MODEL_OPTIONS = [
  { value: "wallet", label: "Wallet (money)" },
  { value: "coupon", label: "Coupon (count)" },
];

export function ConsumptionForm({ rows }: { rows: ConsumptionRow[] }) {
  const { state, onSubmit, pending } = useConfirmedAction(saveConsumptionAction, initial, {
    confirm: {
      title: "Save consumption settings",
      message: "Apply these consumption settings?",
      confirmLabel: "Yes, save",
    },
    successMessage: "Consumption settings saved.",
  });
  const [models, setModels] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.models])),
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm bg-sage-soft px-3 py-2.5 text-sm text-sage-deep">
          Consumption settings saved.
        </p>
      ) : null}

      <p className="text-xs text-muted">
        Pick one or both models. When both are enabled, taps resolve <strong>coupon first, then
        wallet</strong>.
      </p>

      {/* Responsive: stacked cards on phones, aligned grid on sm+. The MultiSelect
          dropdown stays unclipped (no overflow wrapper), so it works in both. */}
      <div className="rounded-md border border-line bg-surface">
        <div className="hidden grid-cols-[1.3fr_2fr_1.3fr_1fr] gap-4 rounded-t-md bg-surface-2 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted sm:grid">
          <span>Category</span>
          <span>Models</span>
          <span>Duplicate window (s)</span>
          <span>Once per session</span>
        </div>

        {rows.map((r) => {
          const selected = models[r.id] ?? [];
          return (
            <div
              key={r.id}
              className="flex flex-col gap-3 border-t border-line p-4 first:border-t-0 sm:grid sm:grid-cols-[1.3fr_2fr_1.3fr_1fr] sm:items-center sm:gap-4 sm:py-3 sm:first:border-t"
            >
              <div className="font-medium text-ink">{r.name}</div>

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-ink-2 sm:hidden">Models</span>
                <MultiSelect
                  options={MODEL_OPTIONS}
                  selected={selected}
                  onChange={(next) => setModels((p) => ({ ...p, [r.id]: next }))}
                  ariaLabel={`${r.name} consumption models`}
                  placeholder="Select model(s)"
                />
                {selected.map((m) => (
                  <input key={m} type="hidden" name={`models_${r.id}`} value={m} />
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 sm:block">
                <span className="text-xs font-semibold text-ink-2 sm:hidden">Duplicate window (s)</span>
                <input
                  name={`dup_${r.id}`}
                  inputMode="numeric"
                  defaultValue={String(r.duplicateWindow)}
                  aria-label={`${r.name} duplicate window seconds`}
                  className="w-24 rounded-sm border border-line-strong bg-surface-2 px-2 py-2 text-right font-mono text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
                />
              </div>

              <div className="flex items-center justify-between gap-3 sm:block">
                <span className="text-xs font-semibold text-ink-2 sm:hidden">Once per session</span>
                <input
                  type="checkbox"
                  name={`restrict_${r.id}`}
                  defaultChecked={r.restrictMealSession}
                  aria-label={`${r.name} restrict to once per meal session`}
                  className="size-4 accent-gold"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
