"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import type { CounterFormState } from "./actions";

export type CounterData = {
  id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
};

export type BranchOption = { id: string; code: string; name: string };

type Action = (prev: CounterFormState, formData: FormData) => Promise<CounterFormState>;

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function CounterForm({
  action,
  counter,
  branches,
  currentBranchId,
}: {
  action: Action;
  counter?: CounterData;
  /** Provided only for all-branch (Super Admin) actors on create; scoped actors
   *  inherit their own branch server-side and see no picker. */
  branches?: BranchOption[];
  currentBranchId?: string;
}) {
  const isEdit = Boolean(counter);
  const { state, onSubmit, pending } = useConfirmedAction(action, {}, {
    confirm: {
      title: isEdit ? "Save changes" : "Create counter",
      message: isEdit ? "Save changes to this counter?" : "Create this counter?",
      confirmLabel: isEdit ? "Yes, save" : "Yes, create",
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
      {counter ? <input type="hidden" name="id" value={counter.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}

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
          <input id="code" name="code" required maxLength={30} defaultValue={counter?.code} placeholder="C1" className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-xs font-semibold text-ink-2">Name</label>
          <input id="name" name="name" required maxLength={120} defaultValue={counter?.name} placeholder="Counter 1 (Main)" className={inputClass} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="status" className="text-xs font-semibold text-ink-2">Status</label>
        <select id="status" name="status" defaultValue={counter?.status ?? "active"} className={`${inputClass} max-w-40`}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Saving…" : counter ? "Save changes" : "Create counter"}
        </button>
        <Link href="/settings/counters" className="rounded-sm border border-line-strong bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Cancel
        </Link>
      </div>
    </form>
  );
}
