"use client";

import { useState } from "react";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { BTN_PRIMARY, BTN_GHOST, FORM_INPUT } from "@/components/ui/controls";
import { vendorAcceptAction, vendorAdvanceAction, vendorRejectAction, type VendorActionState } from "./actions";

const initialState: VendorActionState = {};

/**
 * Vendor-side controls for an order. Which buttons show is decided server-side
 * and passed as flags so this client component never imports Prisma/services.
 * Delivery (out_for_delivery → delivered) is RFID-gated and lives on its own
 * panel (Phase E) — here we only surface the prep transitions + accept/reject.
 */
export function VendorActions({
  requestId,
  code,
  canDecide,
  advanceLabel,
}: {
  requestId: string;
  code: string;
  canDecide: boolean;
  advanceLabel: string | null;
}) {
  const [rejecting, setRejecting] = useState(false);
  const { state, onSubmit, pending } = useConfirmedAction(vendorRejectAction, initialState, {
    confirm: { title: "Reject order", message: `Reject order ${code}?`, confirmLabel: "Yes, reject", tone: "danger" },
    successMessage: "Order rejected.",
  });

  if (!canDecide && !advanceLabel) return null;

  return (
    <div className="rounded-[12px] border border-gold-soft-2 bg-gold-soft/60 p-[14px_16px]">
      {!rejecting ? (
        <div className="flex flex-wrap items-center gap-2.5">
          {canDecide ? (
            <ConfirmActionForm
              action={vendorAcceptAction}
              fields={{ id: requestId }}
              confirm={{ title: "Accept order", message: `Accept order ${code}?`, confirmLabel: "Yes, accept" }}
              successMessage="Order accepted."
              buttonClassName={BTN_PRIMARY}
            >
              Accept order
            </ConfirmActionForm>
          ) : null}
          {advanceLabel ? (
            <ConfirmActionForm
              action={vendorAdvanceAction}
              fields={{ id: requestId }}
              confirm={{ title: advanceLabel, message: `${advanceLabel} for order ${code}?`, confirmLabel: "Yes" }}
              successMessage="Status updated."
              buttonClassName={BTN_PRIMARY}
            >
              {advanceLabel}
            </ConfirmActionForm>
          ) : null}
          {canDecide ? (
            <button type="button" onClick={() => setRejecting(true)} className={`${BTN_GHOST} !text-tomato hover:!bg-tomato-soft`}>
              Reject…
            </button>
          ) : null}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
          <input type="hidden" name="requestId" value={requestId} />
          {state.error ? <p role="alert" className="text-[12px] font-medium text-tomato">{state.error}</p> : null}
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
