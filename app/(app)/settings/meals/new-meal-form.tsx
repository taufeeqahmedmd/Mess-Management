"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { CounterWindowRows, type CounterRow } from "./counter-window-rows";
import { createMealAction } from "./actions";

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

/**
 * Create a meal and assign its counters + service windows in one step. Submits to
 * createMealAction, which creates the meal and the ticked counters' windows
 * atomically. (Edit keeps the two as separate saves since the meal already exists.)
 */
export function NewMealForm({ counters }: { counters: CounterRow[] }) {
  const { state, onSubmit, pending } = useConfirmedAction(createMealAction, {}, {
    confirm: {
      title: "Create meal",
      message: "Create this meal and its counter service windows?",
      confirmLabel: "Yes, create",
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">{state.error}</p>
      ) : null}

      <div className="grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-xs font-semibold text-ink-2">Code</label>
          <input id="code" name="code" required maxLength={30} placeholder="LUN" className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-xs font-semibold text-ink-2">Name</label>
          <input id="name" name="name" required maxLength={80} placeholder="Lunch" className={inputClass} />
        </div>
      </div>

      <div className="grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="startTime" className="text-xs font-semibold text-ink-2">Window start</label>
          <input id="startTime" name="startTime" type="time" required defaultValue="07:00" className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="endTime" className="text-xs font-semibold text-ink-2">Window end</label>
          <input id="endTime" name="endTime" type="time" required defaultValue="11:00" className={`${inputClass} font-mono`} />
        </div>
      </div>
      <p className="-mt-2 max-w-lg text-xs text-muted">
        24-hour times. An end earlier than start is treated as an overnight window.
      </p>

      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" name="active" defaultChecked className="size-4 accent-[var(--gold)]" />
        Active
      </label>

      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Counters &amp; service windows</h2>
          <p className="mt-1 text-sm text-ink-2">
            Tick the counters that serve this meal and set each one&rsquo;s window. You can also do this
            later from the meal&rsquo;s edit page.
          </p>
        </div>
        <CounterWindowRows counters={counters} defaultStart="07:00" defaultEnd="11:00" />
      </div>

      <div className="mt-1 flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Creating…" : "Create meal"}
        </button>
        <Link href="/settings/meals" className="rounded-sm border border-line-strong bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Cancel
        </Link>
      </div>
    </form>
  );
}
