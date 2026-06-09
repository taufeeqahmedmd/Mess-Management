"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { assignMealCountersAction, type MealCountersState } from "./actions";

export type CounterRow = { id: string; name: string; code: string; branch: string };
export type Assignment = { startTime: string; endTime: string };

const initial: MealCountersState = {};

const timeInput =
  "rounded-sm border border-line-strong bg-surface-2 px-2 py-1.5 font-mono text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

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

      {counters.length === 0 ? (
        <p className="rounded-sm bg-gold-soft px-3 py-2.5 text-sm text-ink-2">
          No active counters yet.{" "}
          <Link href="/settings/counters/new" className="font-semibold text-gold-deep hover:underline">
            Create a counter
          </Link>{" "}
          first, then assign it here.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {counters.map((c) => {
            const a = assignments[c.id];
            return (
              <div
                key={c.id}
                className="flex flex-col gap-3 rounded-sm border border-line bg-surface p-3 has-[:checked]:border-gold sm:flex-row sm:items-center sm:gap-4"
              >
                <label className="flex flex-1 items-center gap-3 text-sm">
                  <input type="checkbox" name={`counter_${c.id}`} defaultChecked={Boolean(a)} className="size-4 shrink-0 accent-gold" />
                  <span className="font-medium text-ink">{c.name}</span>
                  <span className="font-mono text-xs text-muted">{c.code}</span>
                  <span className="ml-auto rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{c.branch}</span>
                </label>

                <div className="flex items-center gap-2 sm:shrink-0">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">From</span>
                  <input
                    type="time"
                    name={`start_${c.id}`}
                    defaultValue={a?.startTime ?? defaultStart}
                    aria-label={`${c.name} start time`}
                    className={timeInput}
                  />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">To</span>
                  <input
                    type="time"
                    name={`end_${c.id}`}
                    defaultValue={a?.endTime ?? defaultEnd}
                    aria-label={`${c.name} end time`}
                    className={timeInput}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

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
