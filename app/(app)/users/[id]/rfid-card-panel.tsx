"use client";

import { useState } from "react";
import type { ReactNode } from "react";

function RefreshGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-[15px]" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
    </svg>
  );
}

/**
 * RFID-card panel: header with a collapsible Replace/Issue toggle, the active
 * card "chip" visual, the (collapsible) replace/issue form, and the card-history
 * table. Form + table are server-rendered and passed in; this shell only toggles
 * the form open. Preserves the existing card server actions inside them.
 */
export function RfidCardPanel({
  activeCardUid,
  issued,
  hasActive,
  canReplace,
  form,
  table,
}: {
  activeCardUid: string | null;
  issued: string;
  hasActive: boolean;
  canReplace: boolean;
  form: ReactNode;
  table: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const label = hasActive ? "Replace card" : "Issue card";

  return (
    <section className="overflow-hidden rounded-md border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <span className="h-[17px] w-1 rounded-full bg-gold" />
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-ink">RFID card</h2>
          <p className="text-[12px] text-muted">
            {activeCardUid ? <>Active card <span className="font-mono text-ink">{activeCardUid}</span></> : "No active card."}
          </p>
        </div>
        {canReplace ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={`ml-auto inline-flex items-center gap-2 rounded-sm border px-[18px] py-[9px] text-[13px] font-semibold transition-colors ${
              open ? "border-gold-soft-2 bg-gold-soft text-gold-deep" : "border-line-strong bg-surface text-ink hover:border-gold-soft-2 hover:bg-gold-soft hover:text-gold-deep"
            }`}
          >
            <RefreshGlyph />
            {label}
          </button>
        ) : null}
      </div>

      {hasActive ? (
        <div className="flex items-center gap-4 border-b border-line px-5 py-4">
          <div className="relative h-[60px] w-24 shrink-0 overflow-hidden rounded-[11px] bg-[linear-gradient(135deg,var(--navy),#2A4BB0)] shadow-sm before:absolute before:left-3 before:top-[13px] before:h-4 before:w-[22px] before:rounded before:bg-white/85 before:content-['']" />
          <div className="min-w-0">
            <div className="mb-0.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-sage-deep">
              <span className="size-[7px] rounded-full bg-sage" />
              Active card
            </div>
            <div className="font-mono text-[18px] font-semibold tracking-[0.5px] text-ink">{activeCardUid}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-2">Issued</div>
            <div className="mt-1 font-mono text-[13px] text-ink-2">{issued}</div>
          </div>
        </div>
      ) : null}

      {canReplace && open ? <div className="border-b border-line bg-surface-2 px-5 py-4">{form}</div> : null}

      {table}
    </section>
  );
}
