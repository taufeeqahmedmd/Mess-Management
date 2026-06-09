"use client";

import { useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { logoutAction } from "@/lib/auth-actions";

/**
 * Confirmed sign-out. `logoutAction` clears the session without redirecting, so
 * after it resolves we navigate here — `ConfirmActionForm` can't be used because
 * its catch-all swallows the NEXT_REDIRECT signal a redirecting action throws.
 */
export function SignOutButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function onClick() {
    void (async () => {
      const ok = await confirm({
        title: "Sign out",
        message: "Sign out of your account?",
        confirmLabel: "Sign out",
        cancelLabel: "Stay signed in",
      });
      if (!ok) return;
      startTransition(async () => {
        try {
          await logoutAction();
          window.location.assign("/login"); // full reload so middleware re-evaluates
        } catch {
          toast.error("Couldn't sign out. Please try again.");
        }
      });
    })();
  }

  return (
    <button type="button" onClick={onClick} disabled={pending} className={className}>
      {children}
    </button>
  );
}
