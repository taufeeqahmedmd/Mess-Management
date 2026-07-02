import { Prisma, type LedgerSource } from "@prisma/client";

/**
 * Transactional recharge executors. These run INSIDE a `prisma.$transaction`
 * (pass the tx client). They write append-only ledger rows
 * (wallet_transactions / coupon_transactions), update the cached balances
 * (wallets / coupon_balances) with a `version` bump, and keep `recharges`
 * remaining* in sync. Posted ledger rows are never mutated — reversals/expiry
 * post offsetting DR rows for the remaining (unspent) portion only.
 */

export type ApplyRechargeParams = {
  userId: bigint;
  amount: Prisma.Decimal; // recharge value (collection)
  coupons: { mealTypeId: bigint; count: number }[]; // per-meal coupon grants
  validFrom: Date | null;
  validTill: Date | null;
  paymentModeId: bigint;
  counterId: bigint | null;
  appUserId: bigint | null; // NULL = self-service / online top-up (no operator)
  remarks: string | null;
  cardId?: bigint | null;
  clientUuid: string;
  transactionId?: string | null; // gateway transaction id (online top-ups)
  // When false, `amount` is recorded on the recharge (collection value) but the
  // wallet money balance is NOT credited and remainingAmount is 0 — used for
  // coupon recharges where the per-meal coupons are the spendable balance.
  creditWallet?: boolean;
};

const ZERO = new Prisma.Decimal(0);

/** Post a recharge: credit wallet + coupons, write CR ledger rows, extend validity. */
export async function applyRecharge(
  tx: Prisma.TransactionClient,
  p: ApplyRechargeParams,
): Promise<{ id: bigint }> {
  const creditWallet = p.creditWallet ?? true;
  const hasAmount = p.amount.gt(0);
  const walletCredit = creditWallet && hasAmount;
  const grants = p.coupons.filter((c) => c.count > 0);

  const recharge = await tx.recharge.create({
    data: {
      clientUuid: p.clientUuid,
      userId: p.userId,
      cardId: p.cardId ?? null,
      amount: p.amount,
      // remaining (reversible) wallet money only exists when the wallet is credited;
      // coupon recharges track their unspent portion via the coupons' `remaining`.
      remainingAmount: walletCredit ? p.amount : ZERO,
      validFrom: p.validFrom,
      validTill: p.validTill,
      paymentModeId: p.paymentModeId,
      counterId: p.counterId,
      appUserId: p.appUserId,
      remarks: p.remarks,
      transactionId: p.transactionId ?? null,
      status: "posted",
    },
  });

  if (walletCredit) {
    const wallet = await tx.wallet.upsert({
      where: { userId: p.userId },
      update: { balanceAmount: { increment: p.amount }, version: { increment: 1 } },
      create: { userId: p.userId, balanceAmount: p.amount, version: 1 },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: p.userId,
        txnType: "CR",
        sourceTable: "recharge",
        sourceId: recharge.id,
        amount: p.amount,
        balanceAfter: wallet.balanceAmount,
        reference: "recharge",
      },
    });
  }

  for (const g of grants) {
    await tx.rechargeCoupon.create({
      data: { rechargeId: recharge.id, mealTypeId: g.mealTypeId, count: g.count, remaining: g.count },
    });
    const cb = await tx.couponBalance.upsert({
      where: { userId_mealTypeId: { userId: p.userId, mealTypeId: g.mealTypeId } },
      update: { count: { increment: g.count }, version: { increment: 1 } },
      create: { userId: p.userId, mealTypeId: g.mealTypeId, count: g.count, version: 1 },
    });
    await tx.couponTransaction.create({
      data: {
        userId: p.userId,
        mealTypeId: g.mealTypeId,
        txnType: "CR",
        sourceTable: "recharge",
        sourceId: recharge.id,
        count: g.count,
        balanceAfter: cb.count,
      },
    });
  }

  // Validity: extend only (never shorten); re-validate an expired cardholder.
  if (p.validTill) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: p.userId } });
    const current = user.cardExpiryDate;
    const next = !current || p.validTill > current ? p.validTill : current;
    if (!current || next.getTime() !== current.getTime() || user.validityExpired) {
      await tx.user.update({
        where: { id: p.userId },
        data: { cardExpiryDate: next, validityExpired: false },
      });
    }
  }

  return { id: recharge.id };
}

/**
 * Claw back the REMAINING (unspent) portion of a posted recharge via offsetting
 * DR ledger rows, then zero its remaining and mark it. `source` is "reversal"
 * (edit/delete) or "expiry" (validity claw-back). No-op if not posted.
 */
export async function reverseRechargeRemaining(
  tx: Prisma.TransactionClient,
  rechargeId: bigint,
  source: Extract<LedgerSource, "reversal" | "expiry">,
  appUserId: bigint | null,
): Promise<boolean> {
  const recharge = await tx.recharge.findUnique({
    where: { id: rechargeId },
    include: { coupons: true },
  });
  if (!recharge || recharge.status !== "posted") return false;

  if (recharge.remainingAmount.gt(0)) {
    const wallet = await tx.wallet.update({
      where: { userId: recharge.userId },
      data: { balanceAmount: { decrement: recharge.remainingAmount }, version: { increment: 1 } },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: recharge.userId,
        txnType: "DR",
        sourceTable: source,
        sourceId: rechargeId,
        amount: recharge.remainingAmount,
        balanceAfter: wallet.balanceAmount,
        reference: source,
      },
    });
  }

  for (const c of recharge.coupons) {
    if (c.remaining > 0) {
      const cb = await tx.couponBalance.update({
        where: { userId_mealTypeId: { userId: recharge.userId, mealTypeId: c.mealTypeId } },
        data: { count: { decrement: c.remaining }, version: { increment: 1 } },
      });
      await tx.couponTransaction.create({
        data: {
          userId: recharge.userId,
          mealTypeId: c.mealTypeId,
          txnType: "DR",
          sourceTable: source,
          sourceId: rechargeId,
          count: c.remaining,
          balanceAfter: cb.count,
        },
      });
    }
  }

  await tx.rechargeCoupon.updateMany({ where: { rechargeId }, data: { remaining: 0 } });
  await tx.recharge.update({
    where: { id: rechargeId },
    data: {
      remainingAmount: ZERO,
      status: source === "expiry" ? "expired" : "reversed",
      editedAt: new Date(),
    },
  });
  // appUserId is recorded by the caller's audit row.
  void appUserId;
  return true;
}
