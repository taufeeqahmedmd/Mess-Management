"use client";

import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY } from "@/components/ui/controls";
import { saveConsumptionAction, type ConsumptionState } from "./actions";

export type ConsumptionRow = {
  id: string;
  name: string;
  duplicateWindow: number;
  restrictMealSession: boolean;
};

const initial: ConsumptionState = {};

export function ConsumptionForm({ rows }: { rows: ConsumptionRow[] }) {
  const { state, onSubmit, pending } = useConfirmedAction(saveConsumptionAction, initial, {
    confirm: {
      title: "Save consumption settings",
      message: "Apply these consumption settings?",
      confirmLabel: "Yes, save",
    },
    successMessage: "Consumption settings saved.",
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm border border-sage-soft-2 bg-sage-soft px-3 py-2.5 text-[12.5px] font-medium text-sage-deep">
          Consumption settings saved.
        </p>
      ) : null}

      <p className="rounded-sm border border-line bg-surface-2 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-2">
        Taps resolve by <strong className="font-semibold text-muted">coupon</strong> (one per-meal count each).
        Set the duplicate-tap window and once-per-meal-session rule per category.
      </p>

      <div className="rounded-md border border-line bg-surface shadow-sm">
        <div className="hidden grid-cols-[2fr_1.3fr_1fr] gap-4 border-b border-line bg-surface-2 px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-2 sm:grid">
          <span>Category</span>
          <span className="text-right">Duplicate window (s)</span>
          <span className="text-right">Once per session</span>
        </div>

        {rows.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-3 border-b border-line p-5 last:border-0 sm:grid sm:grid-cols-[2fr_1.3fr_1fr] sm:items-center sm:gap-4 sm:px-5 sm:py-3.5"
          >
            <div className="font-medium text-ink">{r.name}</div>

            <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-2 sm:hidden">Duplicate window (s)</span>
              <input
                name={`dup_${r.id}`}
                inputMode="numeric"
                defaultValue={String(r.duplicateWindow)}
                aria-label={`${r.name} duplicate window seconds`}
                className="w-[84px] rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-right font-mono text-[13px] tabular-nums text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
              />
            </div>

            <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-2 sm:hidden">Once per session</span>
              <input
                type="checkbox"
                name={`restrict_${r.id}`}
                defaultChecked={r.restrictMealSession}
                aria-label={`${r.name} restrict to once per meal session`}
                className="size-[18px] accent-[var(--gold)]"
              />
            </div>
          </div>
        ))}
      </div>

      <div>
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
