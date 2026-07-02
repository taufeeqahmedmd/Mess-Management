"use client";

import { useState } from "react";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, FORM_LABEL, FORM_INPUT, FORM_OPT } from "@/components/ui/controls";
import { saveFoodRequestApprovalAction, type ApprovalFormState } from "./actions";

const initialState: ApprovalFormState = {};

export function ApprovalForm({
  enabled: initialEnabled,
  autoApproveBelow,
}: {
  enabled: boolean;
  autoApproveBelow: number | null;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const { state, onSubmit, pending } = useConfirmedAction(saveFoodRequestApprovalAction, initialState, {
    confirm: {
      title: "Save approval settings",
      message: "Update the food-request approval workflow?",
      confirmLabel: "Yes, save",
    },
    successMessage: "Approval settings saved.",
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}

      <label className="flex items-start gap-3 rounded-[12px] border border-line bg-surface p-[14px_15px]">
        <input type="checkbox" name="enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="mt-0.5 size-4 accent-[var(--gold)]" />
        <span>
          <span className="block text-[13.5px] font-semibold text-ink">Require approval before vendor fulfilment</span>
          <span className="mt-0.5 block text-[12px] text-muted-2">
            When on, new requests wait in <strong>Pending approval</strong> until a staff member with the
            approve permission approves them. When off, requests go straight to the vendor.
          </span>
        </span>
      </label>

      <div>
        <label htmlFor="autoApproveBelow" className={FORM_LABEL}>
          Auto-approve below (₹) <span className={FORM_OPT}>(optional)</span>
        </label>
        <input
          id="autoApproveBelow"
          name="autoApproveBelow"
          inputMode="decimal"
          defaultValue={autoApproveBelow ?? ""}
          placeholder="e.g. 500"
          disabled={!enabled}
          className={`${FORM_INPUT} max-w-[220px] font-mono disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted-2`}
        />
        <p className="mt-1.5 text-[11px] text-muted-2">
          Requests totalling less than this skip approval. Leave blank to require approval for every request.
        </p>
      </div>

      <div>
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
