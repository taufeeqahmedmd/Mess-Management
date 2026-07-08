"use client";

import { useState } from "react";
import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, BTN_GHOST, FORM_LABEL, FORM_INPUT } from "@/components/ui/controls";
import type { CategoryFormState } from "./actions";

export type CategoryData = {
  id: string;
  code: string;
  name: string;
  identifierLabel: string;
  identifierRegex: string | null;
  identifierRequired: boolean;
  identifierUnique: boolean;
  contactRequired: boolean;
  status: "active" | "inactive";
};

type Action = (
  prev: CategoryFormState,
  formData: FormData,
) => Promise<CategoryFormState>;

const inputClass = FORM_INPUT;

/**
 * Switch-style boolean field. Stays a real checkbox (visually hidden) so it
 * submits with the form, is keyboard-operable (Space), and is labelled; the
 * pill/knob is driven by React state with statically-known token classes (the
 * list toggle uses the same set — safe against Tailwind JIT quirks).
 */
function ToggleField({
  name,
  defaultChecked,
  label,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
}) {
  const [on, setOn] = useState(defaultChecked);
  const [focused, setFocused] = useState(false);
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-2">
      <input
        type="checkbox"
        name={name}
        checked={on}
        onChange={(e) => setOn(e.target.checked)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="sr-only"
      />
      <span
        className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors ${on ? "bg-gold" : "bg-line-strong"} ${focused ? "ring-3 ring-gold/20" : ""}`}
      >
        <span className={`inline-block size-3.5 transform rounded-full bg-surface shadow-sm transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
      {label}
    </label>
  );
}

export function CategoryForm({
  action,
  category,
  onCancel,
}: {
  action: Action;
  category?: CategoryData;
  onCancel?: () => void;
}) {
  const isEdit = Boolean(category);
  const { state, onSubmit, pending } = useConfirmedAction(action, {}, {
    confirm: {
      title: isEdit ? "Save changes" : "Create category",
      message: isEdit ? "Save changes to this category?" : "Create this category?",
      confirmLabel: isEdit ? "Yes, save" : "Yes, create",
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="code" className={FORM_LABEL}>Code</label>
          <input id="code" name="code" required maxLength={30} defaultValue={category?.code} placeholder="STU" className={`${inputClass} font-mono`} />
        </div>
        <div>
          <label htmlFor="name" className={FORM_LABEL}>Name</label>
          <input id="name" name="name" required maxLength={80} defaultValue={category?.name} placeholder="Student" className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="identifierLabel" className={FORM_LABEL}>Identifier label</label>
        <input id="identifierLabel" name="identifierLabel" required maxLength={60} defaultValue={category?.identifierLabel ?? "ID"} placeholder="Admission No." className={inputClass} />
        <p className="mt-1.5 text-[11px] text-muted-2">Shown on the cardholder form (e.g. &ldquo;Admission No.&rdquo;).</p>
      </div>

      <div>
        <label htmlFor="identifierRegex" className={FORM_LABEL}>Identifier pattern <span className="font-medium normal-case tracking-normal text-muted-2">(regex, optional)</span></label>
        <input id="identifierRegex" name="identifierRegex" maxLength={120} defaultValue={category?.identifierRegex ?? ""} placeholder="^\d{6}$" className={`${inputClass} font-mono`} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3.5">
        <ToggleField name="identifierRequired" defaultChecked={category ? category.identifierRequired : true} label="Identifier required" />
        <ToggleField name="identifierUnique" defaultChecked={category ? category.identifierUnique : true} label="Identifier unique" />
        <ToggleField name="contactRequired" defaultChecked={category ? category.contactRequired : true} label="Contact required (phone & email)" />
      </div>

      <div>
        <label htmlFor="status" className={FORM_LABEL}>Status</label>
        <select id="status" name="status" defaultValue={category?.status ?? "active"} className={`${inputClass} max-w-40`}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="mt-1 flex items-center gap-2.5">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : category ? "Save changes" : "Create category"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
        ) : (
          <Link href="/settings/categories" className={BTN_GHOST}>Cancel</Link>
        )}
      </div>
    </form>
  );
}
