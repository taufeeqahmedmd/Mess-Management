"use client";

import { useState } from "react";
import { MultiSelect } from "@/components/ui/multi-select";

export type CounterFilterOption = { value: string; label: string; branchId: string };

/**
 * Branch + counter multi-select filters for the Vendor Dashboard. Lives inside
 * the DateRangeForm's GET form: selections are submitted as comma-joined id
 * lists (`branches`, `counters`) via hidden inputs. Picking branches narrows the
 * counter options (and prunes counter selections outside those branches). Empty
 * selection = no filter. The branch select renders only for all-branch actors
 * with more than one branch to choose from.
 */
export function VendorFilters({
  branches,
  counters,
  initialBranches,
  initialCounters,
}: {
  branches: { value: string; label: string }[];
  counters: CounterFilterOption[];
  initialBranches: string[];
  initialCounters: string[];
}) {
  const [branchSel, setBranchSel] = useState(initialBranches);
  const [counterSel, setCounterSel] = useState(initialCounters);

  const branchSet = new Set(branchSel);
  const visibleCounters = branchSel.length > 0 ? counters.filter((c) => branchSet.has(c.branchId)) : counters;

  function onBranchChange(next: string[]) {
    setBranchSel(next);
    if (next.length > 0) {
      const allowed = new Set(counters.filter((c) => next.includes(c.branchId)).map((c) => c.value));
      setCounterSel((prev) => prev.filter((v) => allowed.has(v)));
    }
  }

  return (
    <>
      <input type="hidden" name="branches" value={branchSel.join(",")} />
      <input type="hidden" name="counters" value={counterSel.join(",")} />
      {branches.length > 1 ? (
        <MultiSelect
          options={branches}
          selected={branchSel}
          onChange={onBranchChange}
          ariaLabel="Branches"
          placeholder="All branches"
          fixed
        />
      ) : null}
      <MultiSelect
        options={visibleCounters}
        selected={counterSel}
        onChange={setCounterSel}
        ariaLabel="Counters"
        placeholder="All counters"
        fixed
      />
    </>
  );
}
