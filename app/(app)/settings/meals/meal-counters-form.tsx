"use client";

import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { CounterWindowRows, type CounterRow, type Assignment } from "./counter-window-rows";
import { assignMealCountersAction, type MealCountersState } from "./actions";

export type { CounterRow, Assignment };

const initial: MealCountersState = {};

export function MealCountersForm({
  mealId,
  mealName,
  defaultStart,
  defaultEnd,
  counters,
  assignments,
}: {
  mealId: string;
  mealName: string;
  defaultStart: string;
  defaultEnd: string;
  counters: CounterRow[];
  assignments: Record<string, Assignment>;
}) {
  const { state, onSubmit, pending } = useConfirmedAction(assignMealCountersAction, initial, {
    confirm: {
      title: "Save service windows",
      message: `Update which counters serve ${mealName} and their time windows?`,
      confirmLabel: "Yes, save",
    },
    successMessage: "Service windows saved.",
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="mealId" value={mealId} />

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">{state.error}</p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm bg-sage-soft px-3 py-2.5 text-sm text-sage-deep">Service windows saved.</p>
      ) : null}

      <CounterWindowRows counters={counters} assignments={assignments} defaultStart={defaultStart} defaultEnd={defaultEnd} />

      <p className="text-xs text-muted">
        Tick the counters that serve this meal and set each one&rsquo;s window. Overnight windows
        (e.g. 22:00 → 02:00) are allowed. Unticked counters won&rsquo;t open this meal.
      </p>

      {counters.length > 0 ? (
        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save service windows"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
