"use client";

import { useState } from "react";
import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import type { RechargeFormState } from "./actions";

type Meal = { id: string; name: string };
type PaymentMode = { id: string; name: string };
type Action = (prev: RechargeFormState, formData: FormData) => Promise<RechargeFormState>;

export type RechargeInitial = {
  coupons: Record<string, number>; // mealId -> count
  validTill: string; // "" or YYYY-MM-DD
  paymentModeId: string;
  remarks: string;
};

const initialState: RechargeFormState = {};

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function RechargeForm({
  action,
  userId,
  userName,
  meals,
  rates,
  paymentModes,
  rechargeId,
  initial,
}: {
  action: Action;
  userId: string;
  userName: string;
  meals: Meal[];
  rates: Record<string, string>; // mealId -> category charge (e.g. "60.00"); absent = unpriced
  paymentModes: PaymentMode[];
  rechargeId?: string;
  initial?: RechargeInitial;
}) {
  const isEdit = Boolean(rechargeId);
  const [clientTxId] = useState(() => crypto.randomUUID());
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(meals.map((m) => [m.id, String(initial?.coupons[m.id] ?? 0)])),
  );

  const { state, onSubmit, pending } = useConfirmedAction(action, initialState, {
    confirm: {
      title: isEdit ? "Confirm changes" : "Confirm recharge",
      message: isEdit
        ? `Reverse the unspent remainder and re-apply for ${userName}?`
        : `Apply this recharge to ${userName}?`,
      confirmLabel: isEdit ? "Yes, save" : "Yes, recharge",
      tone: isEdit ? "danger" : "default",
    },
  });

  const lineValue = (mealId: string) => {
    const rate = rates[mealId];
    const n = Number.parseInt(counts[mealId] ?? "0", 10);
    if (!rate || !Number.isInteger(n) || n <= 0) return 0;
    return Number.parseFloat(rate) * n;
  };
  const total = meals.reduce((s, m) => s + lineValue(m.id), 0);

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-5">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="clientTxId" value={clientTxId} />
      {rechargeId ? <input type="hidden" name="rechargeId" value={rechargeId} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-semibold text-ink-2">Coupons per meal</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {meals.map((m) => {
            const rate = rates[m.id];
            const priced = Boolean(rate);
            const line = lineValue(m.id);
            return (
              <label key={m.id} className="flex items-center gap-3 rounded-sm border border-line bg-surface px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{m.name}</span>
                  <span className="block text-xs text-muted">
                    {priced ? `${inr(Number.parseFloat(rate))} each` : "No rate set"}
                  </span>
                </span>
                <input
                  name={`coupon_${m.id}`}
                  inputMode="numeric"
                  value={counts[m.id] ?? "0"}
                  disabled={!priced}
                  onChange={(e) => setCounts((c) => ({ ...c, [m.id]: e.target.value.replace(/[^0-9]/g, "") }))}
                  aria-label={`${m.name} coupons`}
                  className={`w-16 shrink-0 rounded-sm border border-line-strong bg-surface-2 px-2 py-1.5 text-right font-mono text-sm text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20 disabled:opacity-50`}
                />
                {line > 0 ? <span className="w-20 shrink-0 text-right font-mono text-xs text-ink-2">{inr(line)}</span> : <span className="w-20 shrink-0" />}
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-between rounded-sm bg-gold-soft px-3 py-2.5">
          <span className="text-sm font-medium text-ink-2">Wallet amount (coupons × rate)</span>
          <span className="font-display text-lg font-semibold text-ink">{inr(total)}</span>
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="paymentModeId" className="text-xs font-semibold text-ink-2">Payment mode</label>
          <select id="paymentModeId" name="paymentModeId" required className={inputClass} defaultValue={initial?.paymentModeId ?? ""}>
            <option value="" disabled>Select…</option>
            {paymentModes.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="validTill" className="text-xs font-semibold text-ink-2">Valid till (optional)</label>
          <input id="validTill" name="validTill" type="date" defaultValue={initial?.validTill ?? ""} className={inputClass} />
          <p className="text-xs text-muted">Extends the cardholder&rsquo;s validity (never shortens it).</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="remarks" className="text-xs font-semibold text-ink-2">Remarks (optional)</label>
        <input id="remarks" name="remarks" maxLength={255} defaultValue={initial?.remarks ?? ""} className={inputClass} />
      </div>

      {isEdit ? (
        <p className="rounded-sm bg-surface-2 px-3 py-2.5 text-xs text-ink-2">
          Editing reverses the unspent coupons of the original recharge and posts these as a new one.
          Already-consumed coupons are not affected.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Saving…" : isEdit ? "Save changes" : "Recharge"}
        </button>
        <Link href="/recharge" className="rounded-sm border border-line-strong bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Cancel
        </Link>
      </div>
    </form>
  );
}
