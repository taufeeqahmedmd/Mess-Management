"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { BTN_GHOST, PANEL } from "@/components/ui/controls";
import { syncWhatsAppTemplatesAction } from "./actions";

/**
 * WhatsApp Templates tab helpers. Message content always lives in Smartping —
 * the local rows just register names for the event-rule dropdown. Two ways in:
 *  - "Sync from Smartping" (needs a Direct API or Partner API key), or
 *  - manual registration via the TemplateManager below it (fallback while the
 *    account only has the campaign API key).
 */

export function WaSyncPanel({ partnerReady }: { partnerReady: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function sync() {
    startTransition(async () => {
      const r = await syncWhatsAppTemplatesAction();
      if (r.error) toast.error(r.error);
      else {
        toast.success("Templates synced from Smartping.");
        router.refresh();
      }
    });
  }

  return (
    <div className={`${PANEL} flex flex-wrap items-center justify-between gap-3 px-5 py-3.5`}>
      <p className="max-w-[720px] text-[12px] leading-relaxed text-muted-2">
        Templates are created &amp; approved in <b className="text-ink">Smartping</b>.{" "}
        {partnerReady ? (
          <>Sync pulls the approved list automatically; you can also register names manually below.</>
        ) : (
          <>
            Automatic sync needs a <span className="font-mono">SMARTPING_DIRECT_API_KEY</span> or{" "}
            <span className="font-mono">PINBOT_API_KEY</span> (ask Smartping support) — until then, register each
            template/campaign name manually below.
          </>
        )}
      </p>
      <button type="button" onClick={sync} disabled={pending || !partnerReady} className={BTN_GHOST} title={partnerReady ? undefined : "Requires a Direct API or Partner API key"}>
        {pending ? "Syncing…" : "Sync from Smartping"}
      </button>
    </div>
  );
}

export type WaEventRef = { label: string; params: readonly string[] };

/** Which event fields fill {{1}},{{2}},… — build the Smartping template in this order. */
export function WaEventReference({ eventRefs }: { eventRefs: WaEventRef[] }) {
  return (
    <div className={PANEL}>
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-3">
        <span className="h-[15px] w-1 rounded-full bg-gold" />
        <h3 className="font-display text-[15px] font-bold text-ink">Template variables per event</h3>
        <span className="text-[11.5px] text-muted-2">build your Smartping placeholders in this order</span>
      </div>
      <ul className="flex flex-col">
        {eventRefs.map((e) => (
          <li key={e.label} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-2.5 last:border-0">
            <span className="text-[13px] text-ink">{e.label}</span>
            <span className="font-mono text-[11.5px] text-muted-2">
              {e.params.length ? e.params.map((p, i) => `{{${i + 1}}}=${p}`).join("  ") : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
