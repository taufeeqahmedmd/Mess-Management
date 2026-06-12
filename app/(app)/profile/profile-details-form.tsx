"use client";

import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY } from "@/components/ui/controls";
import { updateProfileAction, type ProfileState } from "./actions";
import { FIN, FLAB, FGRID, SGFOOT } from "./profile-styles";

const initial: ProfileState = {};

/** Self-service display name + email form (Personal details section). */
export function ProfileDetailsForm({ name, email }: { name: string; email: string }) {
  const { state, onSubmit, pending } = useConfirmedAction(updateProfileAction, initial, {
    confirm: {
      title: "Save changes",
      message: "Update your display name and email?",
      confirmLabel: "Yes, save",
    },
    successMessage: "Profile updated.",
  });

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4" aria-label="Personal details">
      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm border border-sage-soft-2 bg-sage-soft px-3 py-2.5 text-[12.5px] font-medium text-sage-deep">
          Profile updated.
        </p>
      ) : null}

      <div className={FGRID}>
        <div>
          <label htmlFor="name" className={FLAB}>Display name</label>
          <input id="name" name="name" required maxLength={150} defaultValue={name} className={FIN} />
        </div>
        <div>
          <label htmlFor="email" className={FLAB}>Email address</label>
          <input id="email" name="email" type="email" maxLength={150} defaultValue={email} placeholder="you@example.com" className={FIN} />
        </div>
      </div>

      <div className={SGFOOT}>
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
