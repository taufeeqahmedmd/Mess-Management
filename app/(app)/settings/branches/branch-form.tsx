"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, BTN_GHOST, FORM_LABEL, FORM_INPUT, FORM_OPT } from "@/components/ui/controls";
import type { BranchFormState } from "./actions";

export type BranchData = {
  id: string;
  code: string;
  name: string;
  address: string;
  collectorCode: string;
  status: "active" | "inactive";
};

type Action = (prev: BranchFormState, formData: FormData) => Promise<BranchFormState>;

/** Fixed Jodo collector codes, mapped to their school/branch. The `code` is sent
 *  to the payment gateway; the `label` is what the operator picks. */
const COLLECTOR_CODES = [
  { code: "NACHARAM", label: "DPS Nacharam" },
  { code: "MAHENDRAHILLS", label: "DPS Mahendrahills" },
  { code: "NADERGUL", label: "DPS Nadergul" },
  { code: "GANDIPET", label: "PIS Gandipet" },
] as const;

const inputClass = FORM_INPUT;

export function BranchForm({ action, branch, onCancel }: { action: Action; branch?: BranchData; onCancel?: () => void }) {
  const isEdit = Boolean(branch);
  const { state, onSubmit, pending } = useConfirmedAction(action, {}, {
    confirm: {
      title: isEdit ? "Save changes" : "Create branch",
      message: isEdit ? "Save changes to this branch?" : "Create this branch?",
      confirmLabel: isEdit ? "Yes, save" : "Yes, create",
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      {branch ? <input type="hidden" name="id" value={branch.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="code" className={FORM_LABEL}>Code</label>
          <input id="code" name="code" required maxLength={30} defaultValue={branch?.code} placeholder="MAIN" className={`${inputClass} font-mono`} />
        </div>
        <div>
          <label htmlFor="name" className={FORM_LABEL}>Name</label>
          <input id="name" name="name" required maxLength={150} defaultValue={branch?.name} placeholder="Main Campus" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="address" className={FORM_LABEL}>Address <span className={FORM_OPT}>(optional)</span></label>
          <input id="address" name="address" maxLength={255} defaultValue={branch?.address} placeholder="HQ" className={inputClass} />
        </div>
        <div>
          <label htmlFor="collectorCode" className={FORM_LABEL}>Collector code <span className={FORM_OPT}>(payments)</span></label>
          <select id="collectorCode" name="collectorCode" defaultValue={branch?.collectorCode ?? ""} className={inputClass}>
            <option value="">— None —</option>
            {COLLECTOR_CODES.map((c) => (
              <option key={c.code} value={c.code}>{c.label} ({c.code})</option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-muted-2">Jodo collector code used for this branch&rsquo;s online payments.</p>
        </div>
      </div>

      <div>
        <label htmlFor="status" className={FORM_LABEL}>Status</label>
        <select id="status" name="status" defaultValue={branch?.status ?? "active"} className={`${inputClass} max-w-40`}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="mt-1 flex items-center gap-2.5">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : branch ? "Save changes" : "Create branch"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
        ) : (
          <Link href="/settings/branches" className={BTN_GHOST}>Cancel</Link>
        )}
      </div>
    </form>
  );
}
