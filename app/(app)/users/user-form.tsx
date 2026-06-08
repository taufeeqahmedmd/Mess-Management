"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { UserFormState } from "./actions";

export type UserData = {
  id: string;
  code: string;
  fullName: string;
  categoryId: string;
  departmentId: string;
  branchId: string;
  phone: string;
  email: string;
  cardExpiryDate: string; // "" or YYYY-MM-DD
  photoUrl: string;
  status: "active" | "suspended" | "inactive";
};

type Cat = { id: string; name: string; identifierLabel: string; identifierRequired: boolean };
type Option = { id: string; name: string };
type Action = (prev: UserFormState, formData: FormData) => Promise<UserFormState>;

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function UserForm({
  action,
  user,
  categories,
  departments,
  branches,
  canChooseBranch,
}: {
  action: Action;
  user?: UserData;
  categories: Cat[];
  departments: Option[];
  branches: Option[];
  canChooseBranch: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isEdit = Boolean(user);
  const [categoryId, setCategoryId] = useState(user?.categoryId ?? categories[0]?.id ?? "");
  const cat = categories.find((c) => c.id === categoryId);
  const idLabel = cat?.identifierLabel ?? "Identifier";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {user ? <input type="hidden" name="id" value={user.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="categoryId" className="text-xs font-semibold text-ink-2">Category</label>
          <select
            id="categoryId"
            name="categoryId"
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputClass}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-xs font-semibold text-ink-2">
            {idLabel}
            {cat && !cat.identifierRequired ? " (optional)" : ""}
          </label>
          <input id="code" name="code" maxLength={40} defaultValue={user?.code} className={`${inputClass} font-mono`} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className="text-xs font-semibold text-ink-2">Full name</label>
          <input id="fullName" name="fullName" required maxLength={150} defaultValue={user?.fullName} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-xs font-semibold text-ink-2">Phone</label>
          <input id="phone" name="phone" inputMode="numeric" maxLength={20} defaultValue={user?.phone} className={`${inputClass} font-mono`} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-semibold text-ink-2">Email</label>
          <input id="email" name="email" type="email" maxLength={150} defaultValue={user?.email} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="departmentId" className="text-xs font-semibold text-ink-2">Department</label>
          <select id="departmentId" name="departmentId" defaultValue={user?.departmentId ?? ""} className={inputClass}>
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {canChooseBranch ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="branchId" className="text-xs font-semibold text-ink-2">Branch</label>
            <select id="branchId" name="branchId" defaultValue={user?.branchId ?? branches[0]?.id ?? ""} className={inputClass}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cardExpiryDate" className="text-xs font-semibold text-ink-2">Validity (expiry date)</label>
          <input id="cardExpiryDate" name="cardExpiryDate" type="date" defaultValue={user?.cardExpiryDate} className={inputClass} />
          <p className="text-xs text-muted">Past this date, the wallet and coupons are zeroed. Leave blank for no expiry.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className="text-xs font-semibold text-ink-2">Status</label>
          <select id="status" name="status" defaultValue={user?.status ?? "active"} className={inputClass}>
            <option value="active">Active</option>
            <option value="suspended">Suspended (blocked)</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="photoUrl" className="text-xs font-semibold text-ink-2">Photo URL</label>
          <input id="photoUrl" name="photoUrl" maxLength={255} defaultValue={user?.photoUrl} placeholder="https://…" className={inputClass} />
        </div>
      </div>

      {!isEdit ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cardUid" className="text-xs font-semibold text-ink-2">RFID card UID (optional)</label>
          <input id="cardUid" name="cardUid" maxLength={64} className={`${inputClass} max-w-xs font-mono`} placeholder="Tap a card to fill" />
          <p className="text-xs text-muted">Issues an active card now. You can assign or replace it later.</p>
        </div>
      ) : null}

      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create cardholder"}
        </button>
        <Link href="/users" className="rounded-sm border border-line-strong bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Cancel
        </Link>
      </div>
    </form>
  );
}
