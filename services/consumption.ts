import { Prisma } from "@prisma/client";
import { activeMealNow } from "./meal-window";
import { windowsForCounter } from "./counter-meals";
import { resolveRate } from "./pricing";
import { expireUserValidityInTx } from "./expiry";
import { localDateValue, localDayRange, minutesOfDayInZone } from "@/lib/time";

/**
 * The tap (consumption) engine — plan.md §6.1, run inside one `$transaction`.
 * Idempotent on `clientUuid`: a replayed tap returns the original APPROVED result
 * and never charges twice. Rejected/blocked taps persist nothing (no charge).
 *
 * Resolution per the category's `models`: coupon first, then wallet. When the
 * cardholder has any ACTIVE recharge, consumption is earmarked to what those
 * recharges cover ("MEAL NOT RECHARGED"). On approve: a redemptions row + an
 * append-only DR ledger row + FIFO-decrement of recharge `remaining`.
 *
 * Concurrency (database.md "optimistic locking"): the cached balance row
 * (wallet / coupon_balance) is debited with a version-guarded `updateMany`. If a
 * concurrent tap bumped the version first, the guard matches 0 rows and the
 * engine throws `TapConflictError`; the caller (`lib/run-tap`) retries the whole
 * transaction. The retry re-reads fresh state, so it also re-evaluates the
 * duplicate-window / once-per-session guards against the now-committed redemption
 * — closing the read-then-write race on those checks without a DB trigger.
 */

/** Thrown when an optimistic-lock guard loses a race; the caller retries. */
export class TapConflictError extends Error {
  constructor() {
    super("Tap optimistic-lock conflict — retry");
    this.name = "TapConflictError";
  }
}

/** True for errors a tap transaction should retry: version conflicts, the
 *  Postgres write-conflict/deadlock code, and a duplicate `client_uuid` (a
 *  concurrent replay of the same tap — the retry returns the original result). */
export function isRetryableTapError(e: unknown): boolean {
  if (e instanceof TapConflictError) return true;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2034") return true; // write conflict / deadlock
    if (e.code === "P2002") {
      const target = e.meta?.target;
      const fields = Array.isArray(target) ? target.join(",") : String(target ?? "");
      return fields.includes("client_uuid");
    }
  }
  return false;
}

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
  /** Set to the sync instant when this tap is being replayed from the offline
   *  queue; stamped on the redemption inside the same transaction. */
  syncedAt?: Date | null;
};

const ZERO = new Prisma.Decimal(0);

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
  // All date/time reasoning is in the branch-local timezone (lib/time): `today`
  // (a UTC-midnight Date) compares against `@db.Date` columns; `dayStart/dayEnd`
  // are instants for filtering `redeemed_at`; `nowMin` matches meal windows.
  const today = localDateValue(p.at);
  const { start: dayStart, end: dayEnd } = localDayRange(p.at);
  const nowMin = minutesOfDayInZone(p.at);

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

  // 6. Active meal window — resolved for THIS counter (per-counter service
  // windows; falls back to the global meal windows when a counter has none).
  const windows = await windowsForCounter(tx, p.counterId);
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

  // 9. Once per meal session (today, branch-local).
  if (restrictSession) {
    const sess = await tx.redemption.findFirst({
      where: { userId: user.id, mealTypeId: mealId, status: "posted", redeemedAt: { gte: dayStart, lt: dayEnd } },
    });
    if (sess) return result("BLOCKED", "SESSION USED", meal);
  }

  // 10. Price — counter-specific rate first, else the branch default (current
  // dated). resolveRate filters by counterId so an override at this counter wins
  // deterministically over the NULL-counter default.
  const resolved = await resolveRate(tx, {
    branchId: user.branchId,
    counterId: p.counterId,
    mealTypeId: mealId,
    categoryId: user.categoryId,
    today,
  });
  if (!resolved) return result("REJECTED", "NO RATE", meal);
  const price = resolved.rate;
  const vendor = resolved.vendorRate;

  // 11. Active recharges (earmark constraint), FIFO order.
  const activeRecharges = await tx.recharge.findMany({
    where: { userId: user.id, status: "posted", OR: [{ validTill: null }, { validTill: { gte: today } }] },
    orderBy: { rechargedAt: "asc" },
    include: { coupons: true },
  });
  const hasActiveRecharge = activeRecharges.length > 0;

  // 12. Decide payment — coupon first, then wallet. The cached-balance row's
  // `version` read here is carried into the commit's version-guarded update so a
  // concurrent tap can't debit the same balance twice (database.md).
  let decision:
    | { paidBy: "coupon"; charged: Prisma.Decimal; version: number }
    | { paidBy: "wallet"; charged: Prisma.Decimal; version: number }
    | null = null;
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
    else decision = { paidBy: "coupon", charged: ZERO, version: cb.version };
  }

  if (!decision && models.includes("wallet")) {
    // Earmark applies only to recharges that actually carry unspent WALLET money
    // (remainingAmount > 0). Coupon recharges have remainingAmount 0, so they must
    // never gate wallet spend — otherwise any coupon grant would falsely block
    // every wallet meal ("MEAL NOT RECHARGED") despite a funded wallet.
    const walletEarmarks = activeRecharges.filter((r) => r.remainingAmount.gt(0));
    const availableAmount = walletEarmarks.reduce<Prisma.Decimal>((s, r) => s.plus(r.remainingAmount), ZERO);
    const balance = user.wallet?.balanceAmount ?? ZERO;
    if (walletEarmarks.length > 0 && availableAmount.lt(price)) lastReason = "MEAL NOT RECHARGED";
    else if (!user.wallet || balance.lt(price)) lastReason = "INSUFFICIENT BALANCE";
    else decision = { paidBy: "wallet", charged: price, version: user.wallet.version };
  }

  if (!decision) return result("REJECTED", lastReason, meal);

  // 13. Commit: debit the cached balance under an optimistic-lock guard FIRST, so
  // a lost race aborts before any ledger/redemption row is written, then post the
  // redemption + append-only DR ledger row + FIFO decrement of recharge remainders.
  let walletAfter = user.wallet?.balanceAmount ?? ZERO;
  let couponAfter = 0;

  if (decision.paidBy === "coupon") {
    const upd = await tx.couponBalance.updateMany({
      where: { userId: user.id, mealTypeId: mealId, version: decision.version, count: { gte: 1 } },
      data: { count: { decrement: 1 }, version: { increment: 1 } },
    });
    if (upd.count !== 1) throw new TapConflictError();
    const cb = await tx.couponBalance.findUnique({
      where: { userId_mealTypeId: { userId: user.id, mealTypeId: mealId } },
    });
    couponAfter = cb?.count ?? 0;
  } else {
    const upd = await tx.wallet.updateMany({
      where: { userId: user.id, version: decision.version, balanceAmount: { gte: price } },
      data: { balanceAmount: { decrement: price }, version: { increment: 1 } },
    });
    if (upd.count !== 1) throw new TapConflictError();
    const wallet = await tx.wallet.findUnique({ where: { userId: user.id } });
    walletAfter = wallet?.balanceAmount ?? ZERO;
  }

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
      syncedAt: p.syncedAt ?? null,
    },
  });

  if (decision.paidBy === "coupon") {
    await tx.couponTransaction.create({
      data: {
        userId: user.id,
        mealTypeId: mealId,
        txnType: "DR",
        sourceTable: "redemption",
        sourceId: redemption.id,
        count: 1,
        balanceAfter: couponAfter,
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
    await tx.walletTransaction.create({
      data: {
        walletId: user.wallet!.id,
        userId: user.id,
        txnType: "DR",
        sourceTable: "redemption",
        sourceId: redemption.id,
        amount: price,
        balanceAfter: walletAfter,
        reference: p.syncedAt ? "tap (synced)" : "tap",
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
