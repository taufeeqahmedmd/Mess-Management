"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, BTN_GHOST } from "@/components/ui/controls";
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

const DLABEL = "mb-2 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-2";
const OPT = "font-medium normal-case tracking-normal text-muted-2";
const DINPUT =
  "w-full rounded-sm border border-line-strong bg-surface px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

/**
 * Cardholder create/edit form (Bhojan Tricolour drawer/page body). Used by the
 * Add / Edit slide-in drawer (passes `onCancel`) and the /users/new + /[id]/edit
 * routes. Logic — category-driven identifier label, confirm-before-write, field
 * names — is unchanged; only the presentation is the drawer style.
 */
export function UserForm({
  action,
  user,
  categories,
  departments,
  branches,
  canChooseBranch,
  onCancel,
}: {
  action: Action;
  user?: UserData;
  categories: Cat[];
  departments: Option[];
  branches: Option[];
  canChooseBranch: boolean;
  onCancel?: () => void;
}) {
  const isEdit = Boolean(user);
  const uidRef = useRef<HTMLInputElement>(null);
  const { state, onSubmit, pending } = useConfirmedAction(action, {}, {
    confirm: {
      title: isEdit ? "Save changes" : "Create cardholder",
      message: isEdit ? "Save changes to this cardholder?" : "Create this cardholder?",
      confirmLabel: isEdit ? "Yes, save" : "Yes, create",
    },
  });
  const [categoryId, setCategoryId] = useState(user?.categoryId ?? categories[0]?.id ?? "");
  const cat = categories.find((c) => c.id === categoryId);
  const idLabel = cat?.identifierLabel ?? "Identifier";

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      {user ? <input type="hidden" name="id" value={user.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="categoryId" className={DLABEL}>Category</label>
          <select id="categoryId" name="categoryId" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={DINPUT}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="code" className={DLABEL}>
            {idLabel}{cat && !cat.identifierRequired ? <span className={OPT}> (optional)</span> : null}
          </label>
          <input id="code" name="code" maxLength={40} defaultValue={user?.code} placeholder="STU001" className={`${DINPUT} font-mono`} />
        </div>

        <div>
          <label htmlFor="fullName" className={DLABEL}>Full name</label>
          <input id="fullName" name="fullName" required maxLength={150} defaultValue={user?.fullName} placeholder="Jane Doe" className={DINPUT} />
        </div>
        <div>
          <label htmlFor="phone" className={DLABEL}>Phone</label>
          <input id="phone" name="phone" inputMode="numeric" maxLength={20} defaultValue={user?.phone} placeholder="9000000000" className={`${DINPUT} font-mono`} />
        </div>

        <div>
          <label htmlFor="email" className={DLABEL}>Email</label>
          <input id="email" name="email" type="email" maxLength={150} defaultValue={user?.email} placeholder="you@example.com" className={DINPUT} />
        </div>
        <div>
          <label htmlFor="departmentId" className={DLABEL}>Department</label>
          <select id="departmentId" name="departmentId" defaultValue={user?.departmentId ?? ""} className={DINPUT}>
            <option value="">None</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="branchId" className={DLABEL}>Branch</label>
          <select
            id="branchId"
            name="branchId"
            required
            defaultValue={user?.branchId ?? (canChooseBranch ? "" : branches[0]?.id ?? "")}
            className={DINPUT}
          >
            <option value="" disabled>Select branch…</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        {/* Validity is set/extended via recharge; only surface it when editing. */}
        {isEdit ? (
          <div>
            <label htmlFor="cardExpiryDate" className={DLABEL}>Validity <span className={OPT}>(expiry date)</span></label>
            <input id="cardExpiryDate" name="cardExpiryDate" type="date" defaultValue={user?.cardExpiryDate} className={DINPUT} />
            <p className="mt-1.5 text-[11px] text-muted-2">Past this date the coupons are zeroed. Leave blank for no expiry.</p>
          </div>
        ) : null}

        <div>
          <label htmlFor="status" className={DLABEL}>Status</label>
          <select id="status" name="status" defaultValue={user?.status ?? "active"} className={DINPUT}>
            <option value="active">Active</option>
            <option value="suspended">Suspended (blocked)</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div>
          <label htmlFor="photoUrl" className={DLABEL}>Photo URL <span className={OPT}>(optional)</span></label>
          <input id="photoUrl" name="photoUrl" maxLength={255} defaultValue={user?.photoUrl} placeholder="https://…" className={DINPUT} />
        </div>
      </div>

      {!isEdit ? (
        <div className="border-t border-line pt-4">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-2">Card</div>
          <label htmlFor="cardUid" className={DLABEL}>RFID card UID</label>
          <div className="flex gap-2.5">
            <input ref={uidRef} id="cardUid" name="cardUid" required maxLength={64} className={`${DINPUT} font-mono`} placeholder="Tap a card to fill" />
            <button type="button" onClick={() => uidRef.current?.focus()} className={`${BTN_GHOST} shrink-0`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-[15px]" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>
              Tap
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-2">Issues an active card now. You can assign or replace it later.</p>
        </div>
      ) : null}

      <div className="mt-1 flex items-center gap-2.5">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create cardholder"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
        ) : (
          <Link href="/users" className={BTN_GHOST}>Cancel</Link>
        )}
      </div>
    </form>
  );
}
