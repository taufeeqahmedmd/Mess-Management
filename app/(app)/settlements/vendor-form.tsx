"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import type { VendorFormState } from "./actions";

export type VendorData = {
  id: string;
  code: string;
  name: string;
  gstin: string;
  status: "active" | "inactive";
};

type Action = (prev: VendorFormState, formData: FormData) => Promise<VendorFormState>;

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function VendorForm({ action, vendor }: { action: Action; vendor?: VendorData }) {
  const isEdit = Boolean(vendor);
  const { state, onSubmit, pending } = useConfirmedAction(action, {}, {
    confirm: {
      title: isEdit ? "Save changes" : "Create vendor",
      message: isEdit ? "Save changes to this vendor?" : "Create this vendor?",
      confirmLabel: isEdit ? "Yes, save" : "Yes, create",
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
      {vendor ? <input type="hidden" name="id" value={vendor.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-xs font-semibold text-ink-2">Code</label>
          <input id="code" name="code" required maxLength={30} defaultValue={vendor?.code} placeholder="V1" className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-xs font-semibold text-ink-2">Name</label>
          <input id="name" name="name" required maxLength={150} defaultValue={vendor?.name} placeholder="Annapurna Caterers" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="gstin" className="text-xs font-semibold text-ink-2">GSTIN <span className="text-muted">(optional)</span></label>
          <input id="gstin" name="gstin" maxLength={20} defaultValue={vendor?.gstin} placeholder="22AAAAA0000A1Z5" className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className="text-xs font-semibold text-ink-2">Status</label>
          <select id="status" name="status" defaultValue={vendor?.status ?? "active"} className={inputClass}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Saving…" : vendor ? "Save changes" : "Create vendor"}
        </button>
        <Link href="/settlements/vendors" className="rounded-sm border border-line-strong bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Cancel
        </Link>
      </div>
    </form>
  );
}
