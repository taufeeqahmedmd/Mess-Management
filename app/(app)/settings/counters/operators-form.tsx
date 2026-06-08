"use client";

import { useActionState } from "react";
import { assignOperatorsAction, type OperatorsState } from "./actions";

export type StaffOption = { id: string; name: string; mobile: string; role: string };

const initial: OperatorsState = {};

export function OperatorsForm({
  counterId,
  staff,
  assignedIds,
}: {
  counterId: string;
  staff: StaffOption[];
  assignedIds: string[];
}) {
  const [state, action, pending] = useActionState(assignOperatorsAction, initial);
  const assigned = new Set(assignedIds);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="counterId" value={counterId} />

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">{state.error}</p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-sm bg-sage-soft px-3 py-2.5 text-sm text-sage-deep">Operators saved.</p>
      ) : null}

      {staff.length === 0 ? (
        <p className="text-sm text-ink-2">No staff available to assign.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {staff.map((s) => (
            <label key={s.id} className="flex items-center gap-3 rounded-sm border border-line bg-surface px-3 py-2.5 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-gold/20">
              <input type="checkbox" name="operators" value={s.id} defaultChecked={assigned.has(s.id)} className="size-4 accent-[var(--gold)]" />
              <span className="text-ink">{s.name}</span>
              <span className="font-mono text-xs text-muted">{s.mobile}</span>
              <span className="ml-auto rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{s.role}</span>
            </label>
          ))}
        </div>
      )}

      <div>
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Saving…" : "Save operators"}
        </button>
      </div>
    </form>
  );
}
