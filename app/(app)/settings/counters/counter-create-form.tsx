"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { CounterMealRows, type MealRow } from "./counter-meal-rows";
import { createCounterAction } from "./actions";
import type { BranchOption } from "./counter-form";
import type { StaffOption } from "./operators-form";

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

/**
 * Create a counter in one step: Details → Meals & service windows → Operators.
 * createCounterAction creates the counter, its CounterMeal windows (clamped into
 * each meal's default), and its CounterOperator rows atomically.
 */
export function CounterCreateForm({
  branches,
  currentBranchId,
  meals,
  staff,
}: {
  branches?: BranchOption[];
  currentBranchId?: string;
  meals: MealRow[];
  staff: StaffOption[];
}) {
  const { state, onSubmit, pending } = useConfirmedAction(createCounterAction, {}, {
    confirm: {
      title: "Create counter",
      message: "Create this counter with its meals and operators?",
      confirmLabel: "Yes, create",
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">{state.error}</p>
      ) : null}

      {/* Details */}
      <section className="flex max-w-lg flex-col gap-4">
        <h2 className="font-display text-lg font-semibold text-ink">Details</h2>

        {branches && branches.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="branchId" className="text-xs font-semibold text-ink-2">Branch</label>
            <select id="branchId" name="branchId" required defaultValue={currentBranchId ?? branches[0].id} className={inputClass}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="code" className="text-xs font-semibold text-ink-2">Code</label>
            <input id="code" name="code" required maxLength={30} placeholder="C1" className={`${inputClass} font-mono`} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-xs font-semibold text-ink-2">Name</label>
            <input id="name" name="name" required maxLength={120} placeholder="Counter 1 (Main)" className={inputClass} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className="text-xs font-semibold text-ink-2">Status</label>
          <select id="status" name="status" defaultValue="active" className={`${inputClass} max-w-40`}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </section>

      {/* Meals & service windows */}
      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Meals &amp; service windows</h2>
          <p className="mt-1 text-sm text-ink-2">
            Tick the meals this counter serves and set each window (within the meal&rsquo;s default).
          </p>
        </div>
        <CounterMealRows meals={meals} />
      </section>

      {/* Operators */}
      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Operators</h2>
          <p className="mt-1 text-sm text-ink-2">Staff who may sign in and run this counter.</p>
        </div>
        {staff.length === 0 ? (
          <p className="text-sm text-ink-2">No staff available to assign yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {staff.map((s) => (
              <label key={s.id} className="flex items-center gap-3 rounded-sm border border-line bg-surface px-3 py-2.5 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-gold/20">
                <input type="checkbox" name="operators" value={s.id} className="size-4 accent-gold" />
                <span className="text-ink">{s.name}</span>
                <span className="font-mono text-xs text-muted">{s.mobile}</span>
                <span className="ml-auto rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{s.role}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Creating…" : "Create counter"}
        </button>
        <Link href="/settings/counters" className="rounded-sm border border-line-strong bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Cancel
        </Link>
      </div>
    </form>
  );
}
