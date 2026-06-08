"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { importRechargesAction, type RechargeImportReport } from "./actions";

const initial: RechargeImportReport = {};

export function RechargeImportForm() {
  const [state, dispatch, actionPending] = useActionState(importRechargesAction, initial);
  const confirm = useConfirm();
  const toast = useToast();
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;
  const done = state.total != null;
  const last = useRef<RechargeImportReport>(initial);

  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.error) {
      toast.error(state.error);
    } else if (state.total != null) {
      const failed = state.failures?.length ?? 0;
      toast.success(`Recharged ${state.created} of ${state.total} rows${failed ? `, ${failed} failed` : ""}.`);
    }
  }, [state, toast]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const ok = await confirm({
      title: "Import recharges",
      message: "Apply recharges from the selected CSV file? This moves money into cardholder wallets and coupons.",
      confirmLabel: "Yes, import",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(() => dispatch(new FormData(form)));
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
            Columns: identifier, amount, one column per meal code (coupon count), paymentMode,
            validTill, remarks. Only <span className="font-medium">identifier</span> plus a wallet
            amount or at least one coupon is required.
          </p>
        </div>

        <div>
          <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? "Importing…" : "Import"}
          </button>
        </div>
      </form>

      {done ? (
        <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5">
          <p className="text-sm text-ink-2">
            Recharged <span className="font-semibold text-sage-deep">{state.created}</span> of{" "}
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
