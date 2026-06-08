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

      <div className="overflow-visible rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Models</th>
              <th className="px-4 py-3 font-semibold">Duplicate window (s)</th>
              <th className="px-4 py-3 font-semibold">Once per session</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const selected = models[r.id] ?? [];
              return (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3">
                    <input
                      name={`dup_${r.id}`}
                      inputMode="numeric"
                      defaultValue={String(r.duplicateWindow)}
                      aria-label={`${r.name} duplicate window seconds`}
                      className="w-24 rounded-sm border border-line-strong bg-surface-2 px-2 py-2 text-right font-mono text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      name={`restrict_${r.id}`}
                      defaultChecked={r.restrictMealSession}
                      aria-label={`${r.name} restrict to once per meal session`}
                      className="size-4 accent-[var(--gold)]"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
