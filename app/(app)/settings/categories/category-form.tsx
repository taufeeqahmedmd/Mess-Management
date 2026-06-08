"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import type { CategoryFormState } from "./actions";

export type CategoryData = {
  id: string;
  code: string;
  name: string;
  identifierLabel: string;
  identifierRegex: string | null;
  identifierRequired: boolean;
  identifierUnique: boolean;
  status: "active" | "inactive";
};

type Action = (
  prev: CategoryFormState,
  formData: FormData,
) => Promise<CategoryFormState>;

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function CategoryForm({
  action,
  category,
}: {
  action: Action;
  category?: CategoryData;
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
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-xs font-semibold text-ink-2">Code</label>
          <input id="code" name="code" required maxLength={30} defaultValue={category?.code} placeholder="STU" className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-xs font-semibold text-ink-2">Name</label>
          <input id="name" name="name" required maxLength={80} defaultValue={category?.name} placeholder="Student" className={inputClass} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="identifierLabel" className="text-xs font-semibold text-ink-2">Identifier label</label>
        <input id="identifierLabel" name="identifierLabel" required maxLength={60} defaultValue={category?.identifierLabel ?? "ID"} placeholder="Admission No." className={inputClass} />
        <p className="text-xs text-muted">Shown on the cardholder form (e.g. &ldquo;Admission No.&rdquo;).</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="identifierRegex" className="text-xs font-semibold text-ink-2">Identifier pattern (regex, optional)</label>
        <input id="identifierRegex" name="identifierRegex" maxLength={120} defaultValue={category?.identifierRegex ?? ""} placeholder="^\d{6}$" className={`${inputClass} font-mono`} />
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="identifierRequired" defaultChecked={category ? category.identifierRequired : true} className="size-4 accent-[var(--gold)]" />
          Identifier required
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="identifierUnique" defaultChecked={category ? category.identifierUnique : true} className="size-4 accent-[var(--gold)]" />
          Identifier unique
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="status" className="text-xs font-semibold text-ink-2">Status</label>
        <select id="status" name="status" defaultValue={category?.status ?? "active"} className={`${inputClass} max-w-40`}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Saving…" : category ? "Save changes" : "Create category"}
        </button>
        <Link href="/settings/categories" className="rounded-sm border border-line-strong bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Cancel
        </Link>
      </div>
    </form>
  );
}
