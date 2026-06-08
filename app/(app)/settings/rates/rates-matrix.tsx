"use client";

import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { saveRatesAction, type RatesState } from "./actions";

type Item = { id: string; name: string };
type RateMap = Record<string, { rate: string; vendor: string }>;

const initial: RatesState = {};

const cellInput =
  "w-20 rounded-sm border border-line-strong bg-surface-2 px-2 py-1 text-right font-mono text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20 disabled:opacity-60";

export function RatesMatrix({
  branchId,
  meals,
  categories,
  rates,
  canEdit,
}: {
  branchId: string;
  meals: Item[];
  categories: Item[];
  rates: RateMap;
  canEdit: boolean;
}) {
  const { state, onSubmit, pending } = useConfirmedAction(saveRatesAction, initial, {
    confirm: {
      title: "Save rates",
      message: "Save the current rate matrix?",
      confirmLabel: "Yes, save",
    },
    successMessage: "Rates saved.",
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="branchId" value={branchId} />

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm bg-sage-soft px-3 py-2.5 text-sm text-sage-deep">
          Rates saved.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">Meal</th>
              {categories.map((c) => (
                <th key={c.id} className="px-4 py-3 font-semibold">{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {meals.map((m) => (
              <tr key={m.id} className="border-t border-line align-top">
                <td className="px-4 py-3 font-medium text-ink">{m.name}</td>
                {categories.map((c) => {
                  const v = rates[`${m.id}:${c.id}`] ?? { rate: "", vendor: "" };
                  return (
                    <td key={c.id} className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-1.5 text-xs text-muted">
                          <span className="w-10 text-ink-2">Charge</span>
                          <input
                            name={`rate_${m.id}_${c.id}`}
                            inputMode="decimal"
                            defaultValue={v.rate}
                            disabled={!canEdit}
                            aria-label={`${m.name} ${c.name} charge`}
                            className={cellInput}
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-muted">
                          <span className="w-10 text-ink-2">Vendor</span>
                          <input
                            name={`vendor_${m.id}_${c.id}`}
                            inputMode="decimal"
                            defaultValue={v.vendor}
                            disabled={!canEdit}
                            aria-label={`${m.name} ${c.name} vendor`}
                            className={cellInput}
                          />
                        </label>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save rates"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
