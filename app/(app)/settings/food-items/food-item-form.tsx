"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, BTN_GHOST, FORM_LABEL, FORM_INPUT } from "@/components/ui/controls";
import type { FoodItemFormState } from "./actions";

export type MealOption = { id: string; name: string };
export type BranchOption = { id: string; name: string };
export type FoodItemData = {
  id: string;
  code: string;
  name: string;
  kind: string;
  unitPrice: string;
  unitVendorPrice: string;
  mealTypeId: string;
  branchId: string; // "" = all branches
  active: boolean;
};

type Action = (prev: FoodItemFormState, formData: FormData) => Promise<FoodItemFormState>;

const KINDS = [
  { value: "beverage", label: "Beverage" },
  { value: "snack", label: "Snack" },
  { value: "meal", label: "Meal" },
  { value: "custom", label: "Custom" },
];

export function FoodItemForm({
  action,
  meals,
  branches,
  canChooseBranch,
  item,
}: {
  action: Action;
  meals: MealOption[];
  branches: BranchOption[];
  canChooseBranch: boolean; // only an all-branch actor (Super Admin) picks the branch
  item?: FoodItemData;
}) {
  const isEdit = Boolean(item);
  const { state, onSubmit, pending } = useConfirmedAction(action, {}, {
    confirm: {
      title: isEdit ? "Save changes" : "Create food item",
      message: isEdit ? "Save changes to this food item?" : "Add this food item to the catalog?",
      confirmLabel: isEdit ? "Yes, save" : "Yes, create",
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor="code" className={FORM_LABEL}>Code</label>
          <input id="code" name="code" required maxLength={30} defaultValue={item?.code} placeholder="FI-COFFEE" className={`${FORM_INPUT} font-mono`} />
        </div>
        <div>
          <label htmlFor="name" className={FORM_LABEL}>Name</label>
          <input id="name" name="name" required maxLength={120} defaultValue={item?.name} placeholder="Coffee" className={FORM_INPUT} />
        </div>
        {canChooseBranch ? (
          <div>
            <label htmlFor="branchId" className={FORM_LABEL}>Branch</label>
            <select id="branchId" name="branchId" defaultValue={item?.branchId ?? ""} className={FORM_INPUT}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-muted-2">&ldquo;All branches&rdquo; = offered everywhere; pick a branch to limit this item to it.</p>
          </div>
        ) : null}
        <div>
          <label htmlFor="kind" className={FORM_LABEL}>Kind</label>
          <select id="kind" name="kind" required defaultValue={item?.kind ?? "meal"} className={FORM_INPUT}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mealTypeId" className={FORM_LABEL}>Reports under (meal)</label>
          <select id="mealTypeId" name="mealTypeId" required defaultValue={item?.mealTypeId ?? ""} className={FORM_INPUT}>
            <option value="" disabled>Select…</option>
            {meals.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="unitPrice" className={FORM_LABEL}>Charged price (₹)</label>
          <input id="unitPrice" name="unitPrice" required inputMode="decimal" defaultValue={item?.unitPrice} placeholder="15.00" className={`${FORM_INPUT} font-mono`} />
        </div>
        <div>
          <label htmlFor="unitVendorPrice" className={FORM_LABEL}>Vendor cost (₹)</label>
          <input id="unitVendorPrice" name="unitVendorPrice" required inputMode="decimal" defaultValue={item?.unitVendorPrice} placeholder="10.00" className={`${FORM_INPUT} font-mono`} />
        </div>
      </div>
      <p className="-mt-1 text-[11px] text-muted-2">
        The “reports under” meal groups this item in consumption/settlement reports. Vendor cost drives profit/loss.
      </p>

      <label className="flex items-center gap-2 text-[13px] text-ink-2">
        <input type="checkbox" name="active" defaultChecked={item ? item.active : true} className="size-4 accent-[var(--gold)]" />
        Active
      </label>

      <div className="mt-1 flex items-center gap-2.5">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create item"}
        </button>
        <Link href="/settings/food-items" className={BTN_GHOST}>Cancel</Link>
      </div>
    </form>
  );
}
