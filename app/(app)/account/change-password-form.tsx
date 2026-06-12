"use client";

import { useState } from "react";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY } from "@/components/ui/controls";
import { FIN, FLAB, FGRID, SGFOOT } from "../profile/profile-styles";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const initial: ChangePasswordState = {};

export function ChangePasswordForm() {
  const { state, onSubmit, pending } = useConfirmedAction(changePasswordAction, initial, {
    confirm: {
      title: "Update password",
      message: "Change your account password?",
      confirmLabel: "Yes, update",
    },
    successMessage: "Password updated.",
  });
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  // Cheap strength meter: length + variety.
  const score = next.length === 0 ? 0 : next.length < 6 ? 1 : /[A-Z]/.test(next) && /\d/.test(next) && next.length >= 8 ? 3 : 2;
  const meter = ["w-0 bg-line", "w-1/3 bg-tomato", "w-2/3 bg-gold", "w-full bg-sage"][score];
  const match = confirm.length === 0 ? null : confirm === next;

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4" aria-label="Change password">
      {state.error ? (
        <p role="alert" className="rounded-[11px] border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-[11px] border border-sage-soft-2 bg-sage-soft px-3 py-2.5 text-[12.5px] font-medium text-sage-deep">
          Password updated.
        </p>
      ) : null}

      <div>
        <label htmlFor="current" className={FLAB}>Current password</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required placeholder="••••••••" className={FIN} />
      </div>

      <div className={FGRID}>
        <div>
          <label htmlFor="next" className={FLAB}>New password</label>
          <input id="next" name="next" type="password" autoComplete="new-password" required minLength={6} placeholder="••••••••" value={next} onChange={(e) => setNext(e.target.value)} className={FIN} />
          <div className="mt-[9px] h-[5px] overflow-hidden rounded-full bg-line">
            <span className={`block h-full rounded-full transition-all ${meter}`} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-2">At least 6 characters.</p>
        </div>
        <div>
          <label htmlFor="confirm" className={FLAB}>Confirm new password</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={FIN} />
          <p className={`mt-1.5 text-[11px] ${match === null ? "text-transparent" : match ? "text-sage-deep" : "text-tomato"}`}>
            {match === null ? " " : match ? "Passwords match." : "Passwords don’t match."}
          </p>
        </div>
      </div>

      <div className={SGFOOT}>
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : "Update password"}
        </button>
      </div>
    </form>
  );
}
