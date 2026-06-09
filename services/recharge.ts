import Decimal from "decimal.js";

/**
 * Pure recharge/ledger logic (no DB). The DB executors call these inside a
 * `$transaction`; keeping the math here makes it unit-testable. Money is Decimal
 * end-to-end — never JS float.
 */

export type CouponGrant = { mealTypeId: string; count: number };
export type RechargeInput = { amount: string; coupons: CouponGrant[] };

/** The unspent portion of a posted recharge (what a reversal claws back). */
export type RechargeRemaining = {
  remainingAmount: Decimal.Value;
  coupons: { mealTypeId: string; remaining: number }[];
};

export type ReversalDeltas = {
  walletDebit: Decimal;
  couponDebits: { mealTypeId: string; count: number }[];
};

export type LedgerEntry = { type: "CR" | "DR"; amount: Decimal.Value };

const MONEY = /^\d+(\.\d{1,2})?$/;

/** Validate a recharge before it is applied. Returns an error string, or null. */
export function validateRechargeInput(input: RechargeInput): string | null {
  if (!MONEY.test(input.amount)) {
    return "Amount must be a non-negative number with up to 2 decimals.";
  }
  const amount = new Decimal(input.amount);
  for (const c of input.coupons) {
    if (!Number.isInteger(c.count) || c.count < 0) {
      return "Coupon counts must be non-negative whole numbers.";
    }
  }
  const totalCoupons = input.coupons.reduce((s, c) => s + c.count, 0);
  if (amount.isZero() && totalCoupons === 0) {
    return "Enter a wallet amount or at least one coupon.";
  }
  return null;
}

/**
 * Monetary value of a coupon recharge = Σ(count × category rate per meal). Pure +
 * DB-agnostic: `rates` maps mealTypeId → rate string (the branch charge for the
 * cardholder's category). Returns `{ missingMeal }` if a granted meal has no rate
 * (can't be priced) so the caller can reject — never silently prices at 0.
 */
export function couponValue(
  coupons: CouponGrant[],
  rates: Record<string, string>,
): { value: Decimal } | { missingMeal: string } {
  let value = new Decimal(0);
  for (const c of coupons) {
    if (c.count <= 0) continue;
    const rate = rates[c.mealTypeId];
    if (rate === undefined) return { missingMeal: c.mealTypeId };
    value = value.plus(new Decimal(rate).times(c.count));
  }
  return { value };
}

/**
 * What an edit/delete/expiry claws back: the REMAINING (unspent) wallet money +
 * the remaining coupons per meal. Already-consumed amounts are never touched.
 */
export function reversalDeltas(recharge: RechargeRemaining): ReversalDeltas {
  return {
    walletDebit: new Decimal(recharge.remainingAmount),
    couponDebits: recharge.coupons
      .filter((c) => c.remaining > 0)
      .map((c) => ({ mealTypeId: c.mealTypeId, count: c.remaining })),
  };
}

/** Apply a credit/debit to a balance (returns the new balance; may go negative — the caller guards). */
export function nextWalletBalance(
  current: Decimal.Value,
  type: "CR" | "DR",
  amount: Decimal.Value,
): Decimal {
  const cur = new Decimal(current);
  const amt = new Decimal(amount);
  return type === "CR" ? cur.plus(amt) : cur.minus(amt);
}

/** Reconcile a cached wallet balance from its append-only ledger (CR − DR). */
export function reconcileWallet(entries: LedgerEntry[]): Decimal {
  return entries.reduce<Decimal>(
    (acc, e) => (e.type === "CR" ? acc.plus(e.amount) : acc.minus(e.amount)),
    new Decimal(0),
  );
}
