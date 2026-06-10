"use client";

import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { CounterMealRows, type MealRow, type Assignment } from "./counter-meal-rows";
import { assignCounterMealsAction, type CounterMealsState } from "./actions";

export type { MealRow, Assignment };

const initial: CounterMealsState = {};

export function CounterMealsForm({
  counterId,
  meals,
  assignments,
}: {
  counterId: string;
  meals: MealRow[];
  assignments: Record<string, Assignment>;
}) {
  const { state, onSubmit, pending } = useConfirmedAction(assignCounterMealsAction, initial, {
    confirm: {
      title: "Save service windows",
      message: "Update which meals this counter serves and their time windows?",
      confirmLabel: "Yes, save",
    },
    successMessage: "Service windows saved.",
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="counterId" value={counterId} />

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">{state.error}</p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm bg-sage-soft px-3 py-2.5 text-sm text-sage-deep">Service windows saved.</p>
      ) : null}

      <CounterMealRows meals={meals} assignments={assignments} />

      <p className="text-xs text-muted">
        Tick the meals this counter serves and set each window. A time outside the meal&rsquo;s default
        window is clamped into it on save. Unticked meals won&rsquo;t open at this counter.
      </p>

      {meals.length > 0 ? (
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
