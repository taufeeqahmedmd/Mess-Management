"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Screen-only toolbar for the printable invoice (hidden in print). Also forces
 * the Light theme while the invoice is open — an invoice is a paper document,
 * and dark-theme ink tokens would print light-on-white — restoring the user's
 * saved choice on exit.
 */
export function PrintToolbar({ backHref }: { backHref: string }) {
  useEffect(() => {
    const el = document.documentElement;
    const had = el.getAttribute("data-theme");
    el.removeAttribute("data-theme");
    return () => {
      if (had) el.setAttribute("data-theme", had);
    };
  }, []);

  return (
    <div className="flex items-center justify-between gap-3 print:hidden">
      <Link
        href={backHref}
        className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep"
      >
        ← Back to settlement
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-sm bg-gold px-5 py-2 text-sm font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep"
      >
        Print
      </button>
    </div>
  );
}
