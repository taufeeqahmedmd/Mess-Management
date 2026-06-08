import { Prisma, type PrismaClient } from "@prisma/client";
import { reverseRechargeRemaining } from "./recharge-ledger";

/**
 * Expiry sweeps (plan.md §6.3). Each runs per-item inside its own transaction so
 * one failure doesn't block the rest. The `*InTx` cores do the work on a tx
 * client (unit/integration-testable); the public wrappers find candidates + loop.
 *
 * Intended to run on a schedule (Phase 10); a manual trigger exists for now.
 */

const ZERO = new Prisma.Decimal(0);

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/**
 * Validity claw-back for one cardholder: zero the wallet + all coupon balances
 * via append-only DR `expiry` ledger rows, mark posted recharges expired, and
 * set validityExpired. `sourceId` on the expiry rows is the user id.
 */
export async function expireUserValidityInTx(
  tx: Prisma.TransactionClient,
  userId: bigint,
): Promise<void> {
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (wallet && wallet.balanceAmount.gt(0)) {
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId,
        txnType: "DR",
        sourceTable: "expiry",
        sourceId: userId,
        amount: wallet.balanceAmount,
        balanceAfter: ZERO,
        reference: "validity-expiry",
      },
    });
    await tx.wallet.update({ where: { id: wallet.id }, data: { balanceAmount: ZERO, version: { increment: 1 } } });
  }

  const coupons = await tx.couponBalance.findMany({ where: { userId, count: { gt: 0 } } });
  for (const cb of coupons) {
    await tx.couponTransaction.create({
      data: {
        userId,
        mealTypeId: cb.mealTypeId,
        txnType: "DR",
        sourceTable: "expiry",
        sourceId: userId,
        count: cb.count,
        balanceAfter: 0,
      },
    });
    await tx.couponBalance.update({ where: { id: cb.id }, data: { count: 0, version: { increment: 1 } } });
  }

  const posted = await tx.recharge.findMany({ where: { userId, status: "posted" }, select: { id: true } });
  const ids = posted.map((r) => r.id);
  if (ids.length > 0) {
    await tx.rechargeCoupon.updateMany({ where: { rechargeId: { in: ids } }, data: { remaining: 0 } });
    await tx.recharge.updateMany({
      where: { id: { in: ids } },
      data: { status: "expired", remainingAmount: ZERO, editedAt: new Date() },
    });
  }

  await tx.user.update({ where: { id: userId }, data: { validityExpired: true } });
}

/** Claw back the remaining of every posted recharge past its validTill; mark expired. */
export async function expireRecharges(client: PrismaClient): Promise<number> {
  const due = await client.recharge.findMany({
    where: { status: "posted", validTill: { not: null, lt: todayUtc() } },
    select: { id: true },
  });
  let count = 0;
  for (const r of due) {
    const ok = await client.$transaction((tx) => reverseRechargeRemaining(tx, r.id, "expiry", null));
    if (ok) count++;
  }
  return count;
}

/** Zero wallet + coupons for every cardholder past their cardExpiryDate. */
export async function expireUserValidities(client: PrismaClient): Promise<number> {
  const due = await client.user.findMany({
    where: { validityExpired: false, cardExpiryDate: { not: null, lt: todayUtc() } },
    select: { id: true },
  });
  for (const u of due) {
    await client.$transaction((tx) => expireUserValidityInTx(tx, u.id));
  }
  return due.length;
}
