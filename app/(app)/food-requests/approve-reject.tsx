"use client";

import { useState } from "react";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { BTN_PRIMARY, BTN_GHOST, FORM_INPUT } from "@/components/ui/controls";
import { approveFoodRequestAction, rejectFoodRequestAction, type RejectState } from "./actions";

const initialState: RejectState = {};

/** Approve / reject controls for a request in `pending_approval` (detail page). */
export function ApproveReject({ requestId, code }: { requestId: string; code: string }) {
  const [rejecting, setRejecting] = useState(false);
  const { state, onSubmit, pending } = useConfirmedAction(rejectFoodRequestAction, initialState, {
    confirm: { title: "Reject request", message: `Reject request ${code}?`, confirmLabel: "Yes, reject", tone: "danger" },
    successMessage: "Request rejected.",
  });

  return (
    <div className="rounded-[12px] border border-gold-soft-2 bg-gold-soft/60 p-[14px_16px]">
      <p className="mb-3 text-[13px] font-semibold text-gold-deep">This request is awaiting your approval.</p>

      {!rejecting ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <ConfirmActionForm
            action={approveFoodRequestAction}
            fields={{ id: requestId }}
            confirm={{ title: "Approve request", message: `Approve request ${code} for vendor fulfilment?`, confirmLabel: "Yes, approve" }}
            successMessage="Request approved."
            buttonClassName={BTN_PRIMARY}
          >
            Approve
          </ConfirmActionForm>
          <button type="button" onClick={() => setRejecting(true)} className={`${BTN_GHOST} !text-tomato hover:!bg-tomato-soft`}>
            Reject…
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
          <input type="hidden" name="requestId" value={requestId} />
          {state.error ? (
            <p role="alert" className="text-[12px] font-medium text-tomato">{state.error}</p>
          ) : null}
          <input name="reason" required maxLength={255} placeholder="Reason for rejecting…" aria-label="Rejection reason" className={FORM_INPUT} />
          <div className="flex items-center gap-2.5">
            <button type="submit" disabled={pending} className={`${BTN_PRIMARY} !bg-tomato hover:!bg-tomato`}>
              {pending ? "Rejecting…" : "Confirm reject"}
            </button>
            <button type="button" onClick={() => setRejecting(false)} className={BTN_GHOST}>Back</button>
          </div>
        </form>
      )}
    </div>
  );
}
