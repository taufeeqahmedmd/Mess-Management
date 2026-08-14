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
  emailEntityId: string; // "" = not mapped
  status: "active" | "inactive";
  // Read-only Jodo payment config (from `payment_config`, managed in the DB).
  paymentHasRow: boolean;
  paymentComplete: boolean; // collector code + url + credentials (auth header, or api key + secret) all set
};

export type EntityOption = { id: string; name: string };

type Action = (prev: BranchFormState, formData: FormData) => Promise<BranchFormState>;

const inputClass = FORM_INPUT;

export function BranchForm({ action, branch, entities, onCancel }: { action: Action; branch?: BranchData; entities: EntityOption[]; onCancel?: () => void }) {
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

      <div>
        <label htmlFor="address" className={FORM_LABEL}>Address <span className={FORM_OPT}>(optional)</span></label>
        <input id="address" name="address" maxLength={255} defaultValue={branch?.address} placeholder="HQ" className={inputClass} />
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="emailEntityId" className={FORM_LABEL}>Email entity <span className={FORM_OPT}>(notifications)</span></label>
          <select id="emailEntityId" name="emailEntityId" defaultValue={branch?.emailEntityId ?? ""} className={inputClass}>
            <option value="">— Not mapped —</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-muted-2">Event emails to this branch&rsquo;s cardholders are sent from this entity&rsquo;s domain.</p>
        </div>
        <div>
          <label htmlFor="status" className={FORM_LABEL}>Status</label>
          <select id="status" name="status" defaultValue={branch?.status ?? "active"} className={`${inputClass} max-w-40`}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="border-t border-line pt-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-2">Payment gateway (Jodo)</div>
        {branch?.paymentHasRow ? (
          <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${branch.paymentComplete ? "text-sage-deep" : "text-tomato"}`}>
            <span className={`size-[7px] rounded-full ${branch.paymentComplete ? "bg-sage" : "bg-tomato"}`} />
            {branch.paymentComplete ? "Ready — online top-up enabled" : "Incomplete — set the API key & secret (or auth header) in the DB"}
          </span>
        ) : (
          <p className="text-[12px] text-muted-2">
            Not configured. Online top-up is disabled for this branch until a row is added to the <span className="font-mono">payment_config</span> table.
          </p>
        )}
        <p className="mt-2.5 text-[11px] text-muted-2">Read-only — collector code and API credentials are managed directly in the <span className="font-mono">payment_config</span> database table.</p>
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
