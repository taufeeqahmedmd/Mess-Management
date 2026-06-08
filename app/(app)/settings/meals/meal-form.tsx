"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import type { MealFormState } from "./actions";

export type MealData = {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  active: boolean;
};

type Action = (prev: MealFormState, formData: FormData) => Promise<MealFormState>;

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function MealForm({ action, meal }: { action: Action; meal?: MealData }) {
  const isEdit = Boolean(meal);
  const { state, onSubmit, pending } = useConfirmedAction(action, {}, {
    confirm: {
      title: isEdit ? "Save changes" : "Create meal",
      message: isEdit ? "Save changes to this meal?" : "Create this meal?",
      confirmLabel: isEdit ? "Yes, save" : "Yes, create",
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
      {meal ? <input type="hidden" name="id" value={meal.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-xs font-semibold text-ink-2">Code</label>
          <input id="code" name="code" required maxLength={30} defaultValue={meal?.code} placeholder="LUN" className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-xs font-semibold text-ink-2">Name</label>
          <input id="name" name="name" required maxLength={80} defaultValue={meal?.name} placeholder="Lunch" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="startTime" className="text-xs font-semibold text-ink-2">Window start</label>
          <input id="startTime" name="startTime" type="time" required defaultValue={meal?.startTime ?? "07:00"} className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="endTime" className="text-xs font-semibold text-ink-2">Window end</label>
          <input id="endTime" name="endTime" type="time" required defaultValue={meal?.endTime ?? "11:00"} className={`${inputClass} font-mono`} />
        </div>
      </div>
      <p className="-mt-1 text-xs text-muted">
        24-hour times. An end earlier than start is treated as an overnight window.
      </p>

      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" name="active" defaultChecked={meal ? meal.active : true} className="size-4 accent-[var(--gold)]" />
        Active
      </label>

      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Saving…" : meal ? "Save changes" : "Create meal"}
        </button>
        <Link href="/settings/meals" className="rounded-sm border border-line-strong bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Cancel
        </Link>
      </div>
    </form>
  );
}
