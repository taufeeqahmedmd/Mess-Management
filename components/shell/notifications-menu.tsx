"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { useDismiss } from "./hooks";

/**
 * Notifications bell + dropdown. Empty state for Phase 0 (no notifications wired);
 * the dot is decorative only — real unread state arrives with the data layer.
 */
export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative grid size-10 place-items-center rounded-pill text-ink-2 transition-colors hover:bg-gold/10 hover:text-gold-deep focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
      >
        <Icon name="bell" className="size-5" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-md border border-line bg-surface shadow-lg"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="font-display text-base font-semibold text-ink">
              Notifications
            </p>
          </div>
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-ink-2">You&rsquo;re all caught up.</p>
            <p className="mt-1 text-xs text-muted">
              Recharges and low-balance alerts will show here.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
