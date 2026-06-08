"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const initial: ChangePasswordState = {};

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);

  return (
    <form action={action} className="flex max-w-sm flex-col gap-4" aria-label="Change password">
      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm bg-sage-soft px-3 py-2.5 text-sm text-sage-deep">
          Password updated.
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="current" className="text-xs font-semibold text-ink-2">
          Current password
        </label>
        <input id="current" name="current" type="password" autoComplete="current-password" required className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="next" className="text-xs font-semibold text-ink-2">
          New password
        </label>
        <input id="next" name="next" type="password" autoComplete="new-password" required minLength={6} className={inputClass} />
        <p className="text-xs text-muted">At least 6 characters.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-xs font-semibold text-ink-2">
          Confirm new password
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={inputClass} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-1 self-start rounded-sm bg-gold px-4 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
