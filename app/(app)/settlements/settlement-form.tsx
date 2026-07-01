"use client";

import Link from "next/link";
import { useState } from "react";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { SettlementFormState } from "./actions";

export type VendorOption = { id: string; code: string; name: string };
export type BranchOption = { id: string; name: string };

type Action = (prev: SettlementFormState, formData: FormData) => Promise<SettlementFormState>;

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function SettlementForm({
  action,
  vendors,
  branches,
  scopedBranch,
  defaultStart,
  defaultEnd,
}: {
  action: Action;
  vendors: VendorOption[];
  branches: BranchOption[];
  scopedBranch: BranchOption | null;
  defaultStart: string;
  defaultEnd: string;
}) {
  const { state, onSubmit, pending } = useConfirmedAction(action, {}, {
    confirm: {
      title: "Generate settlement",
      message: "Generate a draft settlement for this vendor and period? It snapshots meal counts and the vendor payable.",
      confirmLabel: "Yes, generate",
    },
  });

  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4">
      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}

      {vendors.length === 0 ? (
        <p className="rounded-sm bg-gold-soft px-3 py-2.5 text-sm text-ink-2">
          No active vendors yet.{" "}
          <Link href="/settings/vendors/new" className="font-semibold text-gold-deep hover:underline">
            Add a vendor
          </Link>{" "}
          first.
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="vendorId" className="text-xs font-semibold text-ink-2">Vendor</label>
        <select id="vendorId" name="vendorId" required defaultValue="" className={inputClass}>
          <option value="" disabled>Select a vendor…</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="branchId" className="text-xs font-semibold text-ink-2">Branch</label>
        {scopedBranch ? (
          <>
            <input type="hidden" name="branchId" value={scopedBranch.id} />
            <input value={scopedBranch.name} readOnly className={`${inputClass} cursor-not-allowed opacity-80`} />
          </>
        ) : (
          <select id="branchId" name="branchId" required defaultValue="" className={inputClass}>
            <option value="" disabled>Select a branch…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink-2">Settlement period</span>
        <input type="hidden" name="periodStart" value={start} />
        <input type="hidden" name="periodEnd" value={end} />
        <DateRangePicker
          from={start}
          to={end}
          ariaLabel="Settlement period"
          onChange={(s, e) => {
            setStart(s);
            setEnd(e);
          }}
        />
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button type="submit" disabled={pending || vendors.length === 0} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Generating…" : "Generate settlement"}
        </button>
        <Link href="/settlements" className="rounded-sm border border-line-strong bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Cancel
        </Link>
      </div>
    </form>
  );
}
