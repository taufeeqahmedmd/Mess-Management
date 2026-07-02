"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, BTN_GHOST, FORM_LABEL, FORM_INPUT } from "@/components/ui/controls";
import type { VendorFormState } from "./actions";

export type VendorData = {
  id: string;
  code: string;
  name: string;
  gstin: string;
  phone: string;
  email: string;
  address: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  notes: string;
  status: "active" | "inactive";
};

type Action = (prev: VendorFormState, formData: FormData) => Promise<VendorFormState>;

const OPT = <span className="font-medium normal-case tracking-normal text-muted-2"> (optional)</span>;

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
    <form onSubmit={onSubmit} className="flex w-full max-w-2xl flex-col gap-4">
      {vendor ? <input type="hidden" name="id" value={vendor.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="code" className={FORM_LABEL}>Code</label>
          <input id="code" name="code" required maxLength={30} defaultValue={vendor?.code} placeholder="V1" className={`${FORM_INPUT} font-mono`} />
        </div>
        <div>
          <label htmlFor="name" className={FORM_LABEL}>Name</label>
          <input id="name" name="name" required maxLength={150} defaultValue={vendor?.name} placeholder="Annapurna Caterers" className={FORM_INPUT} />
        </div>

        <div>
          <label htmlFor="gstin" className={FORM_LABEL}>GSTIN{OPT}</label>
          <input id="gstin" name="gstin" maxLength={20} defaultValue={vendor?.gstin} placeholder="22AAAAA0000A1Z5" className={`${FORM_INPUT} font-mono`} />
        </div>
        <div>
          <label htmlFor="status" className={FORM_LABEL}>Status</label>
          <select id="status" name="status" defaultValue={vendor?.status ?? "active"} className={FORM_INPUT}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div>
          <label htmlFor="phone" className={FORM_LABEL}>Phone{OPT}</label>
          <input id="phone" name="phone" inputMode="tel" maxLength={20} defaultValue={vendor?.phone} placeholder="9000000000" className={`${FORM_INPUT} font-mono`} />
        </div>
        <div>
          <label htmlFor="email" className={FORM_LABEL}>Email{OPT}</label>
          <input id="email" name="email" type="email" maxLength={150} defaultValue={vendor?.email} placeholder="vendor@example.com" className={FORM_INPUT} />
        </div>
      </div>

      <div>
        <label htmlFor="address" className={FORM_LABEL}>Address{OPT}</label>
        <textarea id="address" name="address" rows={2} maxLength={500} defaultValue={vendor?.address} placeholder="Street, city, PIN" className={FORM_INPUT} />
      </div>

      <fieldset className="rounded-sm border border-line p-4">
        <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-2">Bank details (optional)</legend>
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <div>
            <label htmlFor="bankName" className={FORM_LABEL}>Bank name</label>
            <input id="bankName" name="bankName" maxLength={150} defaultValue={vendor?.bankName} placeholder="State Bank of India" className={FORM_INPUT} />
          </div>
          <div>
            <label htmlFor="bankAccountName" className={FORM_LABEL}>Account holder</label>
            <input id="bankAccountName" name="bankAccountName" maxLength={150} defaultValue={vendor?.bankAccountName} placeholder="Annapurna Caterers" className={FORM_INPUT} />
          </div>
          <div>
            <label htmlFor="bankAccountNumber" className={FORM_LABEL}>Account number</label>
            <input id="bankAccountNumber" name="bankAccountNumber" maxLength={40} defaultValue={vendor?.bankAccountNumber} placeholder="00000000000" className={`${FORM_INPUT} font-mono`} />
          </div>
          <div>
            <label htmlFor="bankIfsc" className={FORM_LABEL}>IFSC</label>
            <input id="bankIfsc" name="bankIfsc" maxLength={20} defaultValue={vendor?.bankIfsc} placeholder="SBIN0000123" className={`${FORM_INPUT} font-mono`} />
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor="notes" className={FORM_LABEL}>Vendor details / notes{OPT}</label>
        <textarea id="notes" name="notes" rows={2} maxLength={1000} defaultValue={vendor?.notes} placeholder="Anything else worth recording…" className={FORM_INPUT} />
      </div>

      <div className="mt-1 flex items-center gap-2.5">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create vendor"}
        </button>
        <Link href="/settings/vendors" className={BTN_GHOST}>Cancel</Link>
      </div>
    </form>
  );
}
