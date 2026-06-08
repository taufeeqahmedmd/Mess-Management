import { Prisma } from "@prisma/client";
import { activeMealNow, minutesOfDay, type MealWindow } from "./meal-window";
import { expireUserValidityInTx } from "./expiry";

/**
 * The tap (consumption) engine — plan.md §6.1, run inside one `$transaction`.
 * Idempotent on `clientUuid`: a replayed tap returns the original APPROVED result
 * and never charges twice. Rejected/blocked taps persist nothing (no charge).
 *
 * Resolution per the category's `models`: coupon first, then wallet. When the
 * cardholder has any ACTIVE recharge, consumption is earmarked to what those
 * recharges cover ("MEAL NOT RECHARGED"). On approve: a redemptions row + an
 * append-only DR ledger row + FIFO-decrement of recharge `remaining`.
 */

export type TapStatus = "APPROVED" | "REJECTED" | "BLOCKED";

export type Cardholder = {
  id: string;
  name: string;
  code: string;
  category: string;
  photoUrl: string | null;
  status: string;
  walletBalance: string;
};

export type TapResult = {
  status: TapStatus;
  reason: string;
  paidBy?: "wallet" | "coupon";
  charged?: string;
  meal?: { id: string; name: string };
  cardholder?: Cardholder;
  redemptionId?: string;
};

export type TapParams = {
  cardUid: string;
  counterId: bigint;
  clientUuid: string;
  operatorId: bigint;
  at: Date;
};

const ZERO = new Prisma.Decimal(0);

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

type LoadedUser = Prisma.UserGetPayload<{ include: { category: true; wallet: true } }>;

function cardholderInfo(user: LoadedUser): Cardholder {
  return {
    id: user.id.toString(),
    name: user.fullName,
    code: user.code,
    category: user.category.name,
    photoUrl: user.photoUrl,
    status: user.status,
    walletBalance: (user.wallet?.balanceAmount ?? ZERO).toFixed(2),
  };
}

export async function tapEngine(
  tx: Prisma.TransactionClient,
  p: TapParams,
): Promise<TapResult> {
  const today = startOfUtcDay(p.at);
  const nowMin = minutesOfDay(p.at);

  // 1. Idempotency — replay returns the original APPROVED result.
  const existing = await tx.redemption.findUnique({
    where: { clientUuid: p.clientUuid },
    include: { user: { include: { category: true, wallet: true } }, mealType: true },
  });
  if (existing) {
    return {
      status: "APPROVED",
      reason: "Already recorded",
      paidBy: existing.paidBy ?? undefined,
      charged: existing.amount.toFixed(2),
      meal: { id: existing.mealTypeId.toString(), name: existing.mealType.name },
      cardholder: cardholderInfo(existing.user),
      redemptionId: existing.id.toString(),
    };
  }

  // 2. Resolve cardholder by card UID, else by code (manual/id entry).
  let card = await tx.rfidCard.findUnique({
    where: { cardUid: p.cardUid },
    include: { user: { include: { category: true, wallet: true } } },
  });
  let user: LoadedUser | null = card?.user ?? null;
  if (!user) {
    const byCode = await tx.user.findUnique({
      where: { code: p.cardUid },
      include: { category: true, wallet: true, cards: { where: { status: "active" }, take: 1 } },
    });
    if (byCode) {
      user = byCode;
      card = byCode.cards[0] ? { ...byCode.cards[0], user: byCode } : null;
    }
  }
  if (!user) return { status: "REJECTED", reason: "UNKNOWN CARD" };

  const ch = cardholderInfo(user);
  const result = (status: TapStatus, reason: string, meal?: { id: string; name: string }): TapResult => ({
    status,
    reason,
    cardholder: ch,
    meal,
  });

  // 3. Card status.
  if (!card) return result("REJECTED", "NO ACTIVE CARD");
  if (card.status === "blocked") return result("BLOCKED", "CARD BLOCKED");
  if (card.status !== "active") return result("REJECTED", "CARD INACTIVE");

  // 4. Cardholder status.
  if (user.status === "suspended") return result("BLOCKED", "USER BLOCKED");
  if (user.status !== "active") return result("REJECTED", "USER INACTIVE");

  // 5. Validity expiry (claw back, then block).
  if (user.validityExpired) return result("BLOCKED", "VALIDITY EXPIRED");
  if (user.cardExpiryDate && user.cardExpiryDate < today) {
    await expireUserValidityInTx(tx, user.id);
    return result("BLOCKED", "VALIDITY EXPIRED");
  }

  // 6. Active meal window.
  const meals = await tx.mealType.findMany({ where: { active: true }, orderBy: { startTime: "asc" } });
  const windows: MealWindow[] = meals.map((m) => ({ id: m.id.toString(), name: m.name, startTime: m.startTime, endTime: m.endTime }));
  const open = activeMealNow(windows, nowMin);
  if (!open) return result("REJECTED", "NO MEAL WINDOW");
  const mealId = BigInt(open.id);
  const meal = { id: open.id, name: open.name };

  // 7. Per-category consumption settings.
  const setting = await tx.categorySetting.findFirst({
    where: { categoryId: user.categoryId, status: "active" },
  });
  const models: ("wallet" | "coupon")[] = (setting?.models as ("wallet" | "coupon")[]) ?? ["wallet"];
  const dupWindow = setting?.duplicateWindow ?? 0;
  const restrictSession = setting?.restrictMealSession ?? false;

  // 8. Duplicate-tap window.
  if (dupWindow > 0) {
    const since = new Date(p.at.getTime() - dupWindow * 1000);
    const dup = await tx.redemption.findFirst({
      where: { userId: user.id, mealTypeId: mealId, status: "posted", redeemedAt: { gte: since } },
    });
    if (dup) return result("BLOCKED", "ALREADY UTILIZED", meal);
  }

  // 9. Once per meal session (today).
  if (restrictSession) {
    const endDay = new Date(today.getTime() + 24 * 3600 * 1000);
    const sess = await tx.redemption.findFirst({
      where: { userId: user.id, mealTypeId: mealId, status: "posted", redeemedAt: { gte: today, lt: endDay } },
    });
    if (sess) return result("BLOCKED", "SESSION USED", meal);
  }

  // 10. Price (branch × meal × category, current).
  const rate = await tx.mealRate.findFirst({
    where: {
      branchId: user.branchId,
      mealTypeId: mealId,
      categoryId: user.categoryId,
      validFrom: { lte: today },
      OR: [{ validTo: null }, { validTo: { gte: today } }],
    },
    orderBy: { validFrom: "desc" },
  });
  if (!rate) return result("REJECTED", "NO RATE", meal);
  const price = rate.rate;
  const vendor = rate.vendorRate;

  // 11. Active recharges (earmark constraint), FIFO order.
  const activeRecharges = await tx.recharge.findMany({
    where: { userId: user.id, status: "posted", OR: [{ validTill: null }, { validTill: { gte: today } }] },
    orderBy: { rechargedAt: "asc" },
    include: { coupons: true },
  });
  const hasActiveRecharge = activeRecharges.length > 0;

  // 12. Decide payment — coupon first, then wallet.
  let decision: { paidBy: "coupon" | "wallet"; charged: Prisma.Decimal } | null = null;
  let lastReason = "INSUFFICIENT BALANCE";

  if (models.includes("coupon")) {
    const availableCoupons = activeRecharges.reduce(
      (s, r) => s + r.coupons.filter((c) => c.mealTypeId === mealId).reduce((ss, c) => ss + c.remaining, 0),
      0,
    );
    const cb = await tx.couponBalance.findUnique({
      where: { userId_mealTypeId: { userId: user.id, mealTypeId: mealId } },
    });
    if (hasActiveRecharge && availableCoupons < 1) lastReason = "MEAL NOT RECHARGED";
    else if (!cb || cb.count < 1) lastReason = "INSUFFICIENT COUPON";
    else decision = { paidBy: "coupon", charged: ZERO };
  }

  if (!decision && models.includes("wallet")) {
    const availableAmount = activeRecharges.reduce<Prisma.Decimal>((s, r) => s.plus(r.remainingAmount), ZERO);
    const balance = user.wallet?.balanceAmount ?? ZERO;
    if (hasActiveRecharge && availableAmount.lt(price)) lastReason = "MEAL NOT RECHARGED";
    else if (balance.lt(price)) lastReason = "INSUFFICIENT BALANCE";
    else decision = { paidBy: "wallet", charged: price };
  }

  if (!decision) return result("REJECTED", lastReason, meal);

  // 13. Commit: redemption + DR ledger row + FIFO decrement.
  const redemption = await tx.redemption.create({
    data: {
      clientUuid: p.clientUuid,
      userId: user.id,
      cardId: card.id,
      mealTypeId: mealId,
      counterId: p.counterId,
      categoryId: user.categoryId,
      paidBy: decision.paidBy,
      rateApplied: price,
      amount: decision.charged,
      vendorAmount: vendor,
      appUserId: p.operatorId,
      status: "posted",
      redeemedAt: p.at,
    },
  });

  let walletAfter = user.wallet?.balanceAmount ?? ZERO;

  if (decision.paidBy === "coupon") {
    const cb = await tx.couponBalance.update({
      where: { userId_mealTypeId: { userId: user.id, mealTypeId: mealId } },
      data: { count: { decrement: 1 }, version: { increment: 1 } },
    });
    await tx.couponTransaction.create({
      data: {
        userId: user.id,
        mealTypeId: mealId,
        txnType: "DR",
        sourceTable: "redemption",
        sourceId: redemption.id,
        count: 1,
        balanceAfter: cb.count,
      },
    });
    // FIFO: decrement one active recharge's remaining coupon for this meal.
    for (const r of activeRecharges) {
      const rc = r.coupons.find((c) => c.mealTypeId === mealId && c.remaining > 0);
      if (rc) {
        await tx.rechargeCoupon.update({ where: { id: rc.id }, data: { remaining: { decrement: 1 } } });
        break;
      }
    }
  } else {
    const wallet = await tx.wallet.update({
      where: { userId: user.id },
      data: { balanceAmount: { decrement: price }, version: { increment: 1 } },
    });
    walletAfter = wallet.balanceAmount;
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId: user.id,
        txnType: "DR",
        sourceTable: "redemption",
        sourceId: redemption.id,
        amount: price,
        balanceAfter: wallet.balanceAmount,
        reference: "tap",
      },
    });
    // FIFO: consume `price` across active recharges' remainingAmount.
    let remaining = price;
    for (const r of activeRecharges) {
      if (remaining.lte(0)) break;
      if (r.remainingAmount.lte(0)) continue;
      const take = r.remainingAmount.lt(remaining) ? r.remainingAmount : remaining;
      await tx.recharge.update({ where: { id: r.id }, data: { remainingAmount: { decrement: take } } });
      remaining = remaining.minus(take);
    }
  }

  return {
    status: "APPROVED",
    reason: "Approved",
    paidBy: decision.paidBy,
    charged: decision.charged.toFixed(2),
    meal,
    cardholder: { ...ch, walletBalance: walletAfter.toFixed(2) },
    redemptionId: redemption.id.toString(),
  };
}
