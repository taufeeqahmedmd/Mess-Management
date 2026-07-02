"use client";

import Link from "next/link";
import { useState } from "react";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { MultiSelect } from "@/components/ui/multi-select";
import { BTN_PRIMARY, BTN_GHOST, FORM_LABEL, FORM_INPUT } from "@/components/ui/controls";
import { roleNeedsVendor } from "./vendor-roles";
import type { StaffFormState } from "./actions";

export type StaffData = {
  id: string;
  name: string;
  mobile: string;
  roleId: string;
  branchId: string; // "" = all branches
  status: "active" | "disabled" | "locked";
  cardholderCode?: string; // the staff member's own RFID/cardholder account code, "" if unlinked
  vendorId?: string; // set when role is Vendor / Mess Incharge, "" otherwise
};

type Option = { id: string; name: string };
type Action = (prev: StaffFormState, formData: FormData) => Promise<StaffFormState>;

const inputClass = FORM_INPUT;

export function StaffForm({
  action,
  staff,
  roles,
  branches,
  counters,
  vendors,
  assignedCounterIds = [],
  canChooseBranch,
  onCancel,
}: {
  action: Action;
  staff?: StaffData;
  roles: Option[];
  branches: Option[];
  counters: Option[];
  vendors: Option[];
  assignedCounterIds?: string[];
  canChooseBranch: boolean;
  onCancel?: () => void;
}) {
  const isEdit = Boolean(staff);
  const { state, onSubmit, pending } = useConfirmedAction(action, {}, {
    confirm: {
      title: isEdit ? "Save changes" : "Create staff",
      message: isEdit ? "Save changes to this staff member?" : "Create this staff member?",
      confirmLabel: isEdit ? "Yes, save" : "Yes, create",
    },
  });
  const [counterSel, setCounterSel] = useState<string[]>(assignedCounterIds);
  const [roleId, setRoleId] = useState(staff?.roleId ?? "");
  const selectedRole = roles.find((r) => r.id === roleId);
  const needVendor = roleNeedsVendor(selectedRole?.name);

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      {staff ? <input type="hidden" name="id" value={staff.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={FORM_LABEL}>Name</label>
          <input id="name" name="name" required maxLength={150} defaultValue={staff?.name} placeholder="Jane Doe" className={inputClass} />
        </div>
        <div>
          <label htmlFor="mobile" className={FORM_LABEL}>Mobile number</label>
          <input id="mobile" name="mobile" required inputMode="numeric" defaultValue={staff?.mobile} placeholder="9000000000" className={`${inputClass} font-mono`} />
        </div>
        <div>
          <label htmlFor="roleId" className={FORM_LABEL}>Role</label>
          <select id="roleId" name="roleId" required value={roleId} onChange={(e) => setRoleId(e.target.value)} className={inputClass}>
            <option value="" disabled>Select a role</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        {canChooseBranch ? (
          <div>
            <label htmlFor="branchId" className={FORM_LABEL}>Branch</label>
            <select id="branchId" name="branchId" defaultValue={staff?.branchId ?? ""} className={inputClass}>
              <option value="">All branches (Super Admin)</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        ) : null}
        {needVendor ? (
          <div>
            <label htmlFor="vendorId" className={FORM_LABEL}>Vendor</label>
            <select id="vendorId" name="vendorId" required defaultValue={staff?.vendorId ?? ""} className={inputClass}>
              <option value="" disabled>Select a vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <p className="mt-1.5 text-[11px] text-muted-2">Required for {selectedRole?.name} staff — the vendor they belong to. Manage vendors in Settings → Vendors.</p>
          </div>
        ) : null}
      </div>

      <div>
        <label htmlFor="cardholderCode" className={FORM_LABEL}>
          Linked RFID account <span className="font-medium normal-case tracking-normal text-muted-2">(optional)</span>
        </label>
        <input
          id="cardholderCode"
          name="cardholderCode"
          maxLength={40}
          defaultValue={staff?.cardholderCode ?? ""}
          placeholder="Cardholder code or card UID, e.g. EMP1001"
          className={`${inputClass} font-mono`}
        />
        <p className="mt-1.5 text-[11px] text-muted-2">
          This staff member&rsquo;s own cardholder account — enter the cardholder code or tap their registered
          RFID card. When set, they can raise food requests charged to themselves without searching. Leave blank to unlink.
        </p>
      </div>

      <div>
        <span className={FORM_LABEL}>Counters</span>
        <MultiSelect
          options={counters.map((c) => ({ value: c.id, label: c.name }))}
          selected={counterSel}
          onChange={setCounterSel}
          ariaLabel="Assigned counters"
          placeholder={counters.length ? "Assign counters…" : "No counters available"}
        />
        {counterSel.map((id) => <input key={id} type="hidden" name="counterIds" value={id} />)}
        <p className="mt-1.5 text-[11px] text-muted-2">Counters this staff may sign in and operate. Mirrored on each counter&rsquo;s Operators list.</p>
      </div>

      {isEdit ? (
        <div>
          <label htmlFor="status" className={FORM_LABEL}>Status</label>
          <select id="status" name="status" defaultValue={staff?.status ?? "active"} className={`${inputClass} max-w-40`}>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="locked">Locked</option>
          </select>
        </div>
      ) : (
        <input type="hidden" name="status" value="active" />
      )}

      <div>
        <label htmlFor="password" className={FORM_LABEL}>{isEdit ? "Reset password" : "Password"}</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required={!isEdit} minLength={6} className={inputClass} />
        <p className="mt-1.5 text-[11px] text-muted-2">{isEdit ? "Leave blank to keep the current password. " : ""}At least 6 characters.</p>
      </div>

      <div className="mt-1 flex items-center gap-2.5">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create staff"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
        ) : (
          <Link href="/settings/staff" className={BTN_GHOST}>Cancel</Link>
        )}
      </div>
    </form>
  );
}
