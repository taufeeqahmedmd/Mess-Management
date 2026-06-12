"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, BTN_GHOST, FORM_LABEL, FORM_INPUT } from "@/components/ui/controls";
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

const inputClass = FORM_INPUT;

export function MealForm({ action, meal, onCancel }: { action: Action; meal?: MealData; onCancel?: () => void }) {
  const isEdit = Boolean(meal);
  const { state, onSubmit, pending } = useConfirmedAction(action, {}, {
    confirm: {
      title: isEdit ? "Save changes" : "Create meal",
      message: isEdit ? "Save changes to this meal?" : "Create this meal?",
      confirmLabel: isEdit ? "Yes, save" : "Yes, create",
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      {meal ? <input type="hidden" name="id" value={meal.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="code" className={FORM_LABEL}>Code</label>
          <input id="code" name="code" required maxLength={30} defaultValue={meal?.code} placeholder="LUN" className={`${inputClass} font-mono`} />
        </div>
        <div>
          <label htmlFor="name" className={FORM_LABEL}>Name</label>
          <input id="name" name="name" required maxLength={80} defaultValue={meal?.name} placeholder="Lunch" className={inputClass} />
        </div>
        <div>
          <label htmlFor="startTime" className={FORM_LABEL}>Window start</label>
          <input id="startTime" name="startTime" type="time" required defaultValue={meal?.startTime ?? "07:00"} className={`${inputClass} font-mono`} />
        </div>
        <div>
          <label htmlFor="endTime" className={FORM_LABEL}>Window end</label>
          <input id="endTime" name="endTime" type="time" required defaultValue={meal?.endTime ?? "11:00"} className={`${inputClass} font-mono`} />
        </div>
      </div>
      <p className="-mt-1 text-[11px] text-muted-2">24-hour times. An end earlier than start is treated as an overnight window.</p>

      <label className="flex items-center gap-2 text-[13px] text-ink-2">
        <input type="checkbox" name="active" defaultChecked={meal ? meal.active : true} className="size-4 accent-[var(--gold)]" />
        Active
      </label>

      <div className="mt-1 flex items-center gap-2.5">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : meal ? "Save changes" : "Create meal"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
        ) : (
          <Link href="/settings/meals" className={BTN_GHOST}>Cancel</Link>
        )}
      </div>
    </form>
  );
}
