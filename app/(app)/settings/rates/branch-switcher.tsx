"use client";

import { usePathname, useRouter } from "next/navigation";

export type BranchItem = { id: string; name: string; code: string };

/** Lets an all-branch (Super Admin) actor choose which branch's rates to edit.
 *  Navigates to ?branch=<id>; the server component re-resolves the branch. */
export function BranchSwitcher({ branches, current }: { branches: BranchItem[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="branch-switch" className="text-xs font-semibold text-ink-2">Branch</label>
      <select
        id="branch-switch"
        value={current}
        onChange={(e) => router.push(`${pathname}?branch=${e.target.value}`)}
        className="rounded-sm border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
        ))}
      </select>
    </div>
  );
}
