"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import type { StaffFormState } from "./actions";

export type StaffData = {
  id: string;
  name: string;
  mobile: string;
  roleId: string;
  branchId: string; // "" = all branches
  status: "active" | "disabled" | "locked";
};

type Option = { id: string; name: string };
type Action = (prev: StaffFormState, formData: FormData) => Promise<StaffFormState>;

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function StaffForm({
  action,
  staff,
  roles,
  branches,
  canChooseBranch,
}: {
  action: Action;
  staff?: StaffData;
  roles: Option[];
  branches: Option[];
  canChooseBranch: boolean;
}) {
  const isEdit = Boolean(staff);
  const { state, onSubmit, pending } = useConfirmedAction(action, {}, {
    confirm: {
      title: isEdit ? "Save changes" : "Create staff",
      message: isEdit ? "Save changes to this staff member?" : "Create this staff member?",
      confirmLabel: isEdit ? "Yes, save" : "Yes, create",
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
      {staff ? <input type="hidden" name="id" value={staff.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-xs font-semibold text-ink-2">Name</label>
          <input id="name" name="name" required maxLength={150} defaultValue={staff?.name} placeholder="Jane Doe" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mobile" className="text-xs font-semibold text-ink-2">Mobile number</label>
          <input id="mobile" name="mobile" required inputMode="numeric" defaultValue={staff?.mobile} placeholder="9000000000" className={`${inputClass} font-mono`} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="roleId" className="text-xs font-semibold text-ink-2">Role</label>
          <select id="roleId" name="roleId" required defaultValue={staff?.roleId ?? ""} className={inputClass}>
            <option value="" disabled>Select a role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {canChooseBranch ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="branchId" className="text-xs font-semibold text-ink-2">Branch</label>
            <select id="branchId" name="branchId" defaultValue={staff?.branchId ?? ""} className={inputClass}>
              <option value="">All branches (Super Admin)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {isEdit ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className="text-xs font-semibold text-ink-2">Status</label>
          <select id="status" name="status" defaultValue={staff?.status ?? "active"} className={`${inputClass} max-w-40`}>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="locked">Locked</option>
          </select>
        </div>
      ) : (
        <input type="hidden" name="status" value="active" />
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-semibold text-ink-2">
          {isEdit ? "Reset password" : "Password"}
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" required={!isEdit} minLength={6} className={inputClass} />
        <p className="text-xs text-muted">
          {isEdit ? "Leave blank to keep the current password. " : ""}At least 6 characters.
        </p>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create staff"}
        </button>
        <Link href="/settings/staff" className="rounded-sm border border-line-strong bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Cancel
        </Link>
      </div>
    </form>
  );
}
