import Link from "next/link";
import { inr } from "@/lib/format";
import type { InvoiceTotals } from "@/services/settlement";

/**
 * Compact dashboard strip for vendor invoices (settlements): raised invoices
 * awaiting payment vs already paid, all-time and branch-scoped. Each half links
 * to the settlements list pre-filtered to that status.
 */
export function InvoiceStatusCard({ pending, paid }: { pending: InvoiceTotals; paid: InvoiceTotals }) {
  return (
    <div className="rounded-md border border-line bg-surface px-[19px] py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Vendor invoices</span>
        <Link href="/settlements" className="text-xs font-medium text-ink-2 transition-colors hover:text-gold-deep">
          View all →
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:divide-x sm:divide-line">
        <Link href="/settlements?status=approved" className="group flex items-center justify-between gap-3 sm:pr-5">
          <span className="inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors group-hover:text-gold-deep">
            <span className="size-2 rounded-pill bg-gold" />
            Pending payment
          </span>
          <span className="text-right">
            <span className="font-display text-lg font-bold tabular-nums text-gold-deep">{inr(pending.amount)}</span>
            <span className="block text-[11.5px] text-muted-2">{pending.count} invoice{pending.count === 1 ? "" : "s"} raised</span>
          </span>
        </Link>
        <Link href="/settlements?status=paid" className="group flex items-center justify-between gap-3 sm:pl-5">
          <span className="inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors group-hover:text-gold-deep">
            <span className="size-2 rounded-pill bg-sage" />
            Paid
          </span>
          <span className="text-right">
            <span className="font-display text-lg font-bold tabular-nums text-sage-deep">{inr(paid.amount)}</span>
            <span className="block text-[11.5px] text-muted-2">{paid.count} invoice{paid.count === 1 ? "" : "s"} settled</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
