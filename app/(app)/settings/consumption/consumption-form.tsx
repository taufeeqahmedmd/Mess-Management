"use client";

import { useActionState } from "react";
import { saveConsumptionAction, type ConsumptionState } from "./actions";

export type ConsumptionRow = {
  id: string;
  name: string;
  model: "wallet" | "coupon";
  duplicateWindow: number;
  restrictMealSession: boolean;
};

const initial: ConsumptionState = {};

export function ConsumptionForm({ rows }: { rows: ConsumptionRow[] }) {
  const [state, action, pending] = useActionState(saveConsumptionAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
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

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Model</th>
              <th className="px-4 py-3 font-semibold">Duplicate window (s)</th>
              <th className="px-4 py-3 font-semibold">Once per session</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                <td className="px-4 py-3">
                  <select
                    name={`model_${r.id}`}
                    defaultValue={r.model}
                    aria-label={`${r.name} consumption model`}
                    className="rounded-sm border border-line-strong bg-surface-2 px-3 py-2 text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
                  >
                    <option value="wallet">Wallet (money)</option>
                    <option value="coupon">Coupon (count)</option>
                  </select>
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
            ))}
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
