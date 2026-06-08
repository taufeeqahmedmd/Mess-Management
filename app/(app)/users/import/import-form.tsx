"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { importUsersAction, type ImportReport } from "./actions";

const initial: ImportReport = {};

export function ImportForm() {
  const [state, dispatch, actionPending] = useActionState(importUsersAction, initial);
  const confirm = useConfirm();
  const toast = useToast();
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;
  const done = state.total != null;
  const lastState = useRef<ImportReport>(initial);

  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state.error) {
      toast.error(state.error);
    } else if (state.total != null) {
      const failed = state.failures?.length ?? 0;
      toast.success(
        `Imported ${state.created} of ${state.total} rows${failed ? `, ${failed} failed` : ""}.`,
      );
    }
  }, [state, toast]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const ok = await confirm({
      title: "Import cardholders",
      message: "Import cardholders from the selected CSV file?",
      confirmLabel: "Yes, import",
    });
    if (!ok) return;
    const formData = new FormData(form);
    startTransition(() => dispatch(formData));
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="file" className="text-xs font-semibold text-ink-2">CSV file</label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block w-full max-w-md text-sm text-ink-2 file:mr-3 file:rounded-sm file:border-0 file:bg-gold-soft file:px-4 file:py-2 file:text-sm file:font-semibold file:text-gold-deep hover:file:bg-gold/20"
          />
          <p className="text-xs text-muted">
            Columns: identifier, fullName, category, phone, email, department, status, cardExpiry, cardUid.
            Only <span className="font-medium">fullName</span> and <span className="font-medium">category</span> are required.
          </p>
        </div>

        {state.error ? (
          <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">{state.error}</p>
        ) : null}

        <div>
          <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? "Importing…" : "Import"}
          </button>
        </div>
      </form>

      {done ? (
        <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5">
          <p className="text-sm text-ink-2">
            Imported <span className="font-semibold text-sage-deep">{state.created}</span> of{" "}
            <span className="font-medium text-ink">{state.total}</span> rows.
            {state.failures && state.failures.length > 0 ? (
              <> <span className="font-semibold text-tomato">{state.failures.length}</span> failed.</>
            ) : null}
          </p>

          {state.failures && state.failures.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                    <th className="px-4 py-2.5 font-semibold">Row</th>
                    <th className="px-4 py-2.5 font-semibold">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {state.failures.map((f) => (
                    <tr key={f.row} className="border-t border-line">
                      <td className="px-4 py-2 font-mono text-ink">{f.row}</td>
                      <td className="px-4 py-2 text-tomato">{f.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
