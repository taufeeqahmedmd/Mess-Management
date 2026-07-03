"use client";

import { useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { BTN_GHOST } from "@/components/ui/controls";
import { ClockGlyph } from "@/components/ui/glyphs";
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
        "Claw back the unspent coupons of recharges past their validity, and zero the coupons of cardholders past their expiry date?",
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
    <button type="button" onClick={onClick} disabled={pending} className={BTN_GHOST}>
      <ClockGlyph />
      {pending ? "Running…" : "Run expiry sweep"}
    </button>
  );
}
