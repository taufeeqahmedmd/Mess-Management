"use client";

import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { createRechargeAction, type RechargeFormState } from "./actions";

type Meal = { id: string; name: string };
type PaymentMode = { id: string; name: string };

const initial: RechargeFormState = {};

const inputClass =
  "w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

export function RechargeForm({
  userId,
  userName,
  meals,
  paymentModes,
}: {
  userId: string;
  userName: string;
  meals: Meal[];
  paymentModes: PaymentMode[];
}) {
  const { state, onSubmit, pending } = useConfirmedAction(createRechargeAction, initial, {
    confirm: {
      title: "Confirm recharge",
      message: `Apply this recharge to ${userName}?`,
      confirmLabel: "Yes, recharge",
    },
  });

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-5">
      <input type="hidden" name="userId" value={userId} />

      {state.error ? (
        <p role="alert" className="rounded-sm bg-tomato-soft px-3 py-2.5 text-sm text-tomato">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="amount" className="text-xs font-semibold text-ink-2">Wallet amount (₹)</label>
          <input id="amount" name="amount" inputMode="decimal" defaultValue="0" className={`${inputClass} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="paymentModeId" className="text-xs font-semibold text-ink-2">Payment mode</label>
          <select id="paymentModeId" name="paymentModeId" required className={inputClass} defaultValue="">
            <option value="" disabled>Select…</option>
            {paymentModes.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-semibold text-ink-2">Coupon grants (per meal)</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {meals.map((m) => (
            <label key={m.id} className="flex flex-col gap-1">
              <span className="text-xs text-muted">{m.name}</span>
              <input
                name={`coupon_${m.id}`}
                inputMode="numeric"
                defaultValue="0"
                aria-label={`${m.name} coupons`}
                className={`${inputClass} text-right font-mono`}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">Number of coupons to grant for each meal. Leave 0 to skip.</p>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="validTill" className="text-xs font-semibold text-ink-2">Valid till (optional)</label>
          <input id="validTill" name="validTill" type="date" className={inputClass} />
          <p className="text-xs text-muted">Extends the cardholder&rsquo;s validity (never shortens it).</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="remarks" className="text-xs font-semibold text-ink-2">Remarks (optional)</label>
          <input id="remarks" name="remarks" maxLength={255} className={inputClass} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-sm bg-gold px-5 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Recharging…" : "Recharge"}
        </button>
        <Link href="/recharge" className="rounded-sm border border-line-strong bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
          Cancel
        </Link>
      </div>
    </form>
  );
}
