"use client";

import { useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { runExpiryAction } from "./actions";

/** Confirmed, toast-reporting manual expiry sweep. */
export function ExpirySweepButton() {
  const confirm = useConfirm();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  async function onClick() {
    const ok = await confirm({
      title: "Run expiry sweep",
      message:
        "Claw back the unspent remainder of recharges past their validity, and zero the wallet + coupons of cardholders past their expiry date?",
      confirmLabel: "Yes, run",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await runExpiryAction();
      if (res.error) toast.error(res.error);
      else toast.success(res.message ?? "Expiry sweep complete.");
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep disabled:opacity-60"
    >
      {pending ? "Running…" : "Run expiry sweep"}
    </button>
  );
}
