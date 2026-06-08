"use client";

import { useTransition } from "react";
import { useConfirm, type ConfirmOptions } from "./confirm";
import { useToast } from "./toast";

/**
 * Client wrapper for the inline, single-button server-action forms in list
 * pages (status toggles, block/activate). Renders the hidden fields + button
 * the server component used to render directly, but gates the submit behind a
 * confirm dialog and raises a toast on completion. The action runs only after
 * the user confirms ("else no changes").
 */
export function ConfirmActionForm({
  action,
  fields,
  confirm,
  successMessage,
  className,
  buttonClassName,
  buttonTitle,
  buttonAriaLabel,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  fields?: Record<string, string>;
  confirm?: ConfirmOptions;
  successMessage?: string;
  className?: string;
  buttonClassName?: string;
  buttonTitle?: string;
  buttonAriaLabel?: string;
  children: React.ReactNode;
}) {
  const confirmFn = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const ok = await confirmFn(confirm);
    if (!ok) return;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        // For void, non-redirecting server actions only: a thrown NEXT_REDIRECT
        // would be swallowed by this catch. Redirecting create/edit flows use
        // useConfirmedAction + FlashToast instead.
        await action(formData);
        if (successMessage) toast.success(successMessage);
      } catch {
        toast.error("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      {fields
        ? Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}
      <button
        type="submit"
        disabled={pending}
        title={buttonTitle}
        aria-label={buttonAriaLabel}
        className={buttonClassName}
      >
        {children}
      </button>
    </form>
  );
}
