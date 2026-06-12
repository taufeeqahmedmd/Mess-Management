"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PAGE_SIZES } from "./controls";

/**
 * Shared pager docked in a panel footer: "Showing X–Y of N", a rows-per-page
 * select (10/25/50), and numbered page navigation with a saffron current pill +
 * ellipsis gaps. Preserves all other query params (q, view, filters) when
 * navigating. Pages read `page` + `size` from searchParams; clampPageSize
 * (in controls.ts) validates the size server-side.
 */

function pageList(current: number, last: number): (number | "…")[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const out: (number | "…")[] = [];
  const want = new Set([1, last, current - 1, current, current + 1]);
  let prev = 0;
  for (let p = 1; p <= last; p++) {
    if (!want.has(p)) continue;
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

function chevron(dir: "left" | "right") {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
      {dir === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

export function Pager({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), lastPage);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);

  const href = (next: { page?: number; size?: number }) => {
    const sp = new URLSearchParams(params.toString());
    if (next.page != null) sp.set("page", String(next.page));
    if (next.size != null) {
      sp.set("size", String(next.size));
      sp.set("page", "1");
    }
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const navBtn =
    "grid size-8 place-items-center rounded-sm border border-line-strong text-[12.5px] font-semibold text-ink-2 transition-colors hover:border-gold-soft-2 hover:bg-gold-soft hover:text-gold-deep";

  return (
    <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3 border-t border-line bg-surface-2 px-5 py-3.5">
      <span className="text-[12.5px] tabular-nums text-muted">
        Showing {from}–{to} of {total}
      </span>

      <label className="flex items-center gap-2 text-[12.5px] text-muted">
        Rows per page
        <select
          value={pageSize}
          onChange={(e) => router.push(href({ size: Number(e.target.value) }))}
          className="rounded-sm border border-line-strong bg-surface px-2 py-1 text-[12.5px] text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <nav className="ml-auto flex items-center gap-1.5" aria-label="Pagination">
        {current > 1 ? (
          <Link href={href({ page: current - 1 })} aria-label="Previous page" className={navBtn}>
            {chevron("left")}
          </Link>
        ) : (
          <span className={`${navBtn} cursor-not-allowed opacity-45`} aria-disabled>
            {chevron("left")}
          </span>
        )}

        {pageList(current, lastPage).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-[12.5px] text-muted-2">
              …
            </span>
          ) : p === current ? (
            <span
              key={p}
              aria-current="page"
              className="grid size-8 place-items-center rounded-sm border border-gold bg-gold text-[12.5px] font-semibold text-white shadow-gold"
            >
              {p}
            </span>
          ) : (
            <Link key={p} href={href({ page: p })} className={navBtn}>
              {p}
            </Link>
          ),
        )}

        {current < lastPage ? (
          <Link href={href({ page: current + 1 })} aria-label="Next page" className={navBtn}>
            {chevron("right")}
          </Link>
        ) : (
          <span className={`${navBtn} cursor-not-allowed opacity-45`} aria-disabled>
            {chevron("right")}
          </span>
        )}
      </nav>
    </div>
  );
}
