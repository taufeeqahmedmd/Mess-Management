"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, BTN_GHOST, FORM_LABEL, FORM_INPUT } from "@/components/ui/controls";
import type { LocationFormState } from "./actions";

export type LocationData = {
  id: string;
  name: string;
  branchId: string; // "" = all branches
  status: "active" | "inactive";
};

type Option = { id: string; name: string };
type Action = (prev: LocationFormState, formData: FormData) => Promise<LocationFormState>;

export function LocationForm({
  action,
  location,
  branches,
  canChooseBranch,
}: {
  action: Action;
  location?: LocationData;
  branches: Option[];
  canChooseBranch: boolean;
}) {
  const isEdit = Boolean(location);
  const { state, onSubmit, pending } = useConfirmedAction(action, {}, {
    confirm: {
      title: isEdit ? "Save changes" : "Create location",
      message: isEdit ? "Save changes to this location?" : "Create this delivery location?",
      confirmLabel: isEdit ? "Yes, save" : "Yes, create",
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-lg flex-col gap-4">
      {location ? <input type="hidden" name="id" value={location.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="name" className={FORM_LABEL}>Name</label>
        <input id="name" name="name" required maxLength={150} defaultValue={location?.name} placeholder="e.g. Block A — Conference Room" className={FORM_INPUT} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {canChooseBranch ? (
          <div>
            <label htmlFor="branchId" className={FORM_LABEL}>Branch</label>
            <select id="branchId" name="branchId" defaultValue={location?.branchId ?? ""} className={FORM_INPUT}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        ) : null}
        <div>
          <label htmlFor="status" className={FORM_LABEL}>Status</label>
          <select id="status" name="status" defaultValue={location?.status ?? "active"} className={FORM_INPUT}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="mt-1 flex items-center gap-2.5">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create location"}
        </button>
        <Link href="/settings/delivery-locations" className={BTN_GHOST}>Cancel</Link>
      </div>
    </form>
  );
}
