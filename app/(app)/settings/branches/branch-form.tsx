"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import type { BranchFormState } from "./actions";

export type BranchData = {
  id: string;
  code: string;
  name: string;
  address: string;
  status: "active" | "inactive";
};

type Action = (prev: BranchFormState, formData: FormData) => Promise<BranchFormState>;

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function BranchForm({ action, branch }: { action: Action; branch?: BranchData }) {
  const isEdit = Boolean(branch);
  const { state, onSubmit, pending } = useConfirmedAction(action, {}, {
    confirm: {
      title: isEdit ? "Save changes" : "Create branch",
      message: isEdit ? "Save changes to this branch?" : "Create this branch?",
      confirmLabel: isEdit ? "Yes, save" : "Yes, create",
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
      {branch ? <input type="hidden" name="id" value={branch.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-xs font-semibold text-ink-2">Code</label>
          <input id="code" name="code" required maxLength={30} defaultValue={branch?.code} placeholder="MAIN" className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-xs font-semibold text-ink-2">Name</label>
          <input id="name" name="name" required maxLength={150} defaultValue={branch?.name} placeholder="Main Campus" className={inputClass} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="address" className="text-xs font-semibold text-ink-2">Address <span className="font-normal text-muted">(optional)</span></label>
        <input id="address" name="address" maxLength={255} defaultValue={branch?.address} placeholder="HQ" className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="status" className="text-xs font-semibold text-ink-2">Status</label>
        <select id="status" name="status" defaultValue={branch?.status ?? "active"} className={`${inputClass} max-w-40`}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Saving…" : branch ? "Save changes" : "Create branch"}
        </button>
        <Link href="/settings/branches" className="rounded-sm border border-line-strong bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Cancel
        </Link>
      </div>
    </form>
  );
}
