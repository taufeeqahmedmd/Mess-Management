"use client";

import { useState } from "react";
import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, BTN_GHOST } from "@/components/ui/controls";
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

const DLABEL = "mb-2 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-2";
const DINPUT =
  "w-full rounded-sm border border-line-strong bg-surface px-3 py-2.5 text-[13.5px] text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Recharge form (Bhojan Tricolour drawer/page body). Per-meal coupon tiles with
 * steppers + a live wallet total, payment mode, validity, and remarks. Used by
 * the recharge create page (/recharge/new), the edit page, and the slide-in edit
 * drawer (passes `onCancel` to close instead of navigating). Logic — counts
 * state, pricing, idempotent clientTxId, confirm-before-write — is unchanged.
 */
export function RechargeForm({
  action,
  userId,
  userName,
  meals,
  rates,
  paymentModes,
  rechargeId,
  initial,
  returnTo,
  onCancel,
}: {
  action: Action;
  userId: string;
  userName: string;
  meals: Meal[];
  rates: Record<string, string>; // mealId -> category charge (e.g. "60.00"); absent = unpriced
  paymentModes: PaymentMode[];
  rechargeId?: string;
  initial?: RechargeInitial;
  returnTo?: string; // where to land after save (defaults to /recharge)
  onCancel?: () => void;
}) {
  const isEdit = Boolean(rechargeId);
  const [clientTxId] = useState(() => crypto.randomUUID());
  // Only meals with a rate set for this category are offered. A rate row carries
  // both the sale (charge) and vendor (cost); no row = neither set, so the meal
  // can't be recharged and is hidden.
  const pricedMeals = meals.filter((m) => rates[m.id] != null);
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(pricedMeals.map((m) => [m.id, initial?.coupons[m.id] ?? 0])),
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

  const setCount = (id: string, n: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, n) }));
  const lineValue = (mealId: string) => {
    const rate = rates[mealId];
    const n = counts[mealId] ?? 0;
    if (!rate || n <= 0) return 0;
    return Number.parseFloat(rate) * n;
  };
  const total = pricedMeals.reduce((s, m) => s + lineValue(m.id), 0);

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="clientTxId" value={clientTxId} />
      {rechargeId ? <input type="hidden" name="rechargeId" value={rechargeId} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}

      <div>
        <span className={DLABEL}>Coupons per meal</span>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {pricedMeals.length === 0 ? (
            <p className="text-[12.5px] text-muted-2">No meals have a rate set for this category. Set one under Settings → Rates.</p>
          ) : null}
          {pricedMeals.map((m) => {
            const rate = rates[m.id];
            const priced = Boolean(rate);
            const n = counts[m.id] ?? 0;
            const line = lineValue(m.id);
            return (
              <div
                key={m.id}
                className={`rounded-[12px] border p-[12px_13px] transition-colors ${
                  !priced ? "border-line opacity-70" : n > 0 ? "border-gold-soft-2 bg-gold-soft" : "border-line bg-surface"
                }`}
              >
                <div className="mb-2.5 flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-ink">{m.name}</div>
                    <div className="mt-0.5 text-[10.5px] text-muted-2">{priced ? `${inr(Number.parseFloat(rate))} each` : "No rate set"}</div>
                  </div>
                  {priced ? (
                    <div className={`shrink-0 font-mono text-[12.5px] font-semibold tabular-nums ${line === 0 ? "text-muted-2" : "text-gold-deep"}`}>{inr(line)}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2.5">
                  <input
                    name={`coupon_${m.id}`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={n}
                    disabled={!priced}
                    onChange={(e) => setCount(m.id, Number.parseInt(e.target.value || "0", 10) || 0)}
                    aria-label={`${m.name} coupons`}
                    className="w-[62px] rounded-[9px] border border-line-strong bg-surface px-2 py-1.5 text-center font-mono text-sm font-semibold tabular-nums text-ink focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted-2"
                  />
                  {priced ? (
                    <div className="flex flex-col gap-[3px]">
                      <button type="button" aria-label={`Increment ${m.name}`} onClick={() => setCount(m.id, n + 1)} className="grid h-[15px] w-5 place-items-center rounded-[5px] border border-line-strong text-muted transition-colors hover:border-gold-soft-2 hover:bg-gold-soft hover:text-gold-deep">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="size-[9px]"><path d="M6 15l6-6 6 6" /></svg>
                      </button>
                      <button type="button" aria-label={`Decrement ${m.name}`} onClick={() => setCount(m.id, n - 1)} className="grid h-[15px] w-5 place-items-center rounded-[5px] border border-line-strong text-muted transition-colors hover:border-gold-soft-2 hover:bg-gold-soft hover:text-gold-deep">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="size-[9px]"><path d="M6 9l6 6 6-6" /></svg>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-[12px] border border-gold-soft-2 bg-gold-soft px-4 py-3">
        <span className="text-[12.5px] font-medium text-gold-deep">Recharge value (coupons × rate)</span>
        <span className="font-display text-xl font-bold tabular-nums text-gold-deep">{inr(total)}</span>
      </div>

      <div>
        <label htmlFor="paymentModeId" className={DLABEL}>Payment mode</label>
        <select id="paymentModeId" name="paymentModeId" required className={DINPUT} defaultValue={initial?.paymentModeId ?? ""}>
          <option value="" disabled>Select…</option>
          {paymentModes.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="remarks" className={DLABEL}>Remarks <span className="font-medium normal-case tracking-normal text-muted-2">(optional)</span></label>
        <input id="remarks" name="remarks" maxLength={255} defaultValue={initial?.remarks ?? ""} placeholder="Add a note…" className={DINPUT} />
      </div>

      {isEdit ? (
        <p className="rounded-sm border border-line bg-surface-2 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-2">
          Editing reverses the unspent coupons of the original recharge and posts these as a new one.
          Already-consumed coupons are not affected.
        </p>
      ) : null}

      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Recharge"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
        ) : (
          <Link href="/recharge" className={BTN_GHOST}>Cancel</Link>
        )}
      </div>
    </form>
  );
}
