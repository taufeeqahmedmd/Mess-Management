"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { INPUT_FIND } from "@/components/ui/controls";

/**
 * Live search + filter bar for the cardholders table. Typing/selecting debounces
 * a soft navigation to /users?… (no Search button, no full-page reload) so the
 * server-rendered table re-filters as you interact. Inputs stay mounted across
 * the soft nav, so focus and caret are preserved. Changing any filter resets to
 * page 1 (page/size are intentionally dropped from the URL).
 */

export type UserFilterOption = { id: string; name: string };

export type UserFilterValues = {
  q: string;
  category: string;
  department: string;
  branch: string;
  status: string;
  validity: string;
  card: string;
  coupons: string;
};

const SEL =
  "rounded-[9px] border border-line-strong bg-surface px-2.5 py-2 text-[12.5px] text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function UserSearch({
  initial,
  categories,
  departments,
  branches,
  canChooseBranch,
}: {
  initial: UserFilterValues;
  categories: UserFilterOption[];
  departments: UserFilterOption[];
  branches: UserFilterOption[];
  canChooseBranch: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState<UserFilterValues>(initial);
  const firstRun = useRef(true);

  useEffect(() => {
    // Don't re-navigate on mount (the URL already reflects `initial`).
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      const term = f.q.trim();
      if (term) params.set("q", term);
      for (const k of ["category", "department", "branch", "status", "validity", "card", "coupons"] as const) {
        if (f[k]) params.set(k, f[k]);
      }
      const qs = params.toString();
      router.replace(qs ? `/users?${qs}` : "/users", { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [f, router]);

  const set = (patch: Partial<UserFilterValues>) => setF((prev) => ({ ...prev, ...patch }));
  const anyFilter = Boolean(
    f.q || f.category || f.department || f.branch || f.status || f.validity || f.card || f.coupons,
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search by id, name, phone, email, card UID…"
          aria-label="Search cardholders"
          autoComplete="off"
          className={`${INPUT_FIND} sm:max-w-[420px]`}
        />
        {anyFilter ? (
          <button
            type="button"
            onClick={() =>
              setF({ q: "", category: "", department: "", branch: "", status: "", validity: "", card: "", coupons: "" })
            }
            className="inline-flex items-center px-3 text-[13px] font-medium text-muted transition-colors hover:text-ink-2"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={f.category} onChange={(e) => set({ category: e.target.value })} aria-label="Filter by category" className={SEL}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {departments.length > 0 ? (
          <select value={f.department} onChange={(e) => set({ department: e.target.value })} aria-label="Filter by department" className={SEL}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        ) : null}

        {canChooseBranch && branches.length > 1 ? (
          <select value={f.branch} onChange={(e) => set({ branch: e.target.value })} aria-label="Filter by branch" className={SEL}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        ) : null}

        <select value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Filter by status" className={SEL}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Blocked</option>
          <option value="inactive">Inactive</option>
        </select>

        <select value={f.validity} onChange={(e) => set({ validity: e.target.value })} aria-label="Filter by validity" className={SEL}>
          <option value="">Any validity</option>
          <option value="valid">Valid</option>
          <option value="expiring30">Expiring in 30 days</option>
          <option value="expired">Expired</option>
          <option value="none">No expiry set</option>
        </select>

        <select value={f.card} onChange={(e) => set({ card: e.target.value })} aria-label="Filter by card" className={SEL}>
          <option value="">Card: any</option>
          <option value="with">Has active card</option>
          <option value="without">No active card</option>
        </select>

        <select value={f.coupons} onChange={(e) => set({ coupons: e.target.value })} aria-label="Filter by coupons" className={SEL}>
          <option value="">Coupons: any</option>
          <option value="with">Has coupons</option>
          <option value="none">No coupons</option>
        </select>
      </div>
    </div>
  );
}
