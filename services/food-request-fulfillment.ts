/**
 * Food-request delivery fulfilment (plan.md §15.2) — the money-critical path,
 * run inside one `$transaction`. Mirrors the counter tap engine's discipline:
 *
 *  - RFID verification: the tapped card must resolve to the request's charged
 *    cardholder's ACTIVE card, else delivery is blocked (no charge).
 *  - Wallet debit under an optimistic-lock guard (version + balance), so a lost
 *    race aborts before any ledger row is written; the caller retries.
 *  - The charge lands as `redemption` rows (one per request line) on the branch's
 *    "Food Requests" virtual counter, plus append-only `wallet_transactions` (DR)
 *    — the SAME ledger as a counter tap, so settlement/reports include it with no
 *    query changes.
 *  - Idempotent on the request: a re-tap of an already-delivered request returns
 *    the original result and never double-charges.
 *
 * The amount charged is RECOMPUTED from the request's line snapshots — never
 * trusted from a client.
 */

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

const ZERO = new Prisma.Decimal(0);

/** Thrown when the wallet optimistic-lock guard loses a race; caller retries. */
export class FulfillConflictError extends Error {
  constructor() {
    super("Fulfilment optimistic-lock conflict — retry");
    this.name = "FulfillConflictError";
  }
}

/** Retryable: version conflict, PG write-conflict/deadlock, duplicate client_uuid. */
export function isRetryableFulfillError(e: unknown): boolean {
  if (e instanceof FulfillConflictError) return true;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2034") return true;
    if (e.code === "P2002") {
      const t = e.meta?.target;
      const f = Array.isArray(t) ? t.join(",") : String(t ?? "");
      return f.includes("client_uuid");
    }
  }
  return false;
}

export type FulfillStatus = "DELIVERED" | "REJECTED";

export type FulfillResult = {
  status: FulfillStatus;
  reason: string;
  charged?: string;
  cardholder?: { name: string; code: string; walletBalance: string };
  /** Set on success so the caller can audit the request that was delivered. */
  requestId?: string;
};

export type FulfillParams = {
  requestId: bigint;
  cardUid: string;
  clientUuid: string; // request-level idempotency token
  vendorAppUserId: bigint; // operator stamped on the redemptions
  at: Date;
};

export async function fulfillFoodRequest(
  tx: Prisma.TransactionClient,
  p: FulfillParams,
): Promise<FulfillResult> {
  const req = await tx.foodRequest.findUnique({
    where: { id: p.requestId },
    include: {
      items: true,
      user: { include: { category: true, wallet: true } },
    },
  });
  if (!req) return { status: "REJECTED", reason: "Request not found." };

  const ch = (walletBalance: Prisma.Decimal) => ({
    name: req.user.fullName,
    code: req.user.code,
    walletBalance: walletBalance.toFixed(2),
  });

  // 1. Idempotency — an already-delivered request returns its original result.
  if (req.status === "delivered") {
    return {
      status: "DELIVERED",
      reason: "Already delivered",
      charged: req.amount.toFixed(2),
      cardholder: ch(req.user.wallet?.balanceAmount ?? ZERO),
      requestId: req.id.toString(),
    };
  }

  // 2. Only an out-for-delivery request can be completed.
  if (req.status !== "out_for_delivery") {
    return { status: "REJECTED", reason: "This request is not out for delivery." };
  }

  // 3. RFID verification — the card must belong to this cardholder and be active.
  const card = await tx.rfidCard.findUnique({ where: { cardUid: p.cardUid } });
  if (!card) return { status: "REJECTED", reason: "UNKNOWN CARD" };
  if (card.userId !== req.userId) {
    return { status: "REJECTED", reason: "CARD DOES NOT MATCH CARDHOLDER" };
  }
  if (card.status === "blocked") return { status: "REJECTED", reason: "CARD BLOCKED" };
  if (card.status !== "active") return { status: "REJECTED", reason: "CARD INACTIVE" };
  if (req.user.status !== "active") return { status: "REJECTED", reason: "CARDHOLDER INACTIVE" };

  // 4. The branch's "Food Requests" virtual counter gives the redemptions a real
  // branch (how reporting scopes). Auto-provision it if a branch lacks one.
  let counter = await tx.counter.findFirst({ where: { branchId: req.branchId, code: "FR" } });
  if (!counter) {
    counter = await tx.counter.create({
      data: { branchId: req.branchId, code: "FR", name: "Food Requests" },
    });
  }

  // 5. Recompute the charge from the line snapshots — never trust the cached total.
  const lines = req.items.map((it) => ({
    mealTypeId: it.mealTypeId,
    sale: it.unitPrice.mul(it.qty),
    vendor: it.unitVendorPrice.mul(it.qty),
  }));
  const total = lines.reduce<Prisma.Decimal>((s, l) => s.plus(l.sale), ZERO);

  const balanceBefore = req.user.wallet?.balanceAmount ?? ZERO;

  // 6. Funds precheck — reject before writing anything if the wallet can't cover.
  if (total.gt(0) && (!req.user.wallet || balanceBefore.lt(total))) {
    return { status: "REJECTED", reason: "INSUFFICIENT BALANCE", cardholder: ch(balanceBefore) };
  }

  // 7. Claim the delivery atomically. This compare-and-swap on `status` serialises
  // concurrent / double-submitted deliveries — even free (total=0) ones that the
  // wallet version guard wouldn't cover — so only ONE caller can charge. The loser
  // re-reads and returns the original result idempotently. A later rollback (e.g. a
  // wallet conflict below) undoes this claim too, so the request never ends up
  // "delivered" without a charge.
  const claim = await tx.foodRequest.updateMany({
    where: { id: req.id, status: "out_for_delivery" },
    data: { status: "delivered", deliveredAt: p.at, cardIdUsed: card.id, fulfilledClientUuid: p.clientUuid },
  });
  if (claim.count !== 1) {
    const fresh = await tx.foodRequest.findUnique({
      where: { id: req.id },
      include: { user: { include: { wallet: true } } },
    });
    if (fresh?.status === "delivered") {
      return {
        status: "DELIVERED",
        reason: "Already delivered",
        charged: fresh.amount.toFixed(2),
        cardholder: ch(fresh.user.wallet?.balanceAmount ?? ZERO),
        requestId: req.id.toString(),
      };
    }
    return { status: "REJECTED", reason: "Could not complete delivery — please retry." };
  }

  // 8. Debit the wallet under the optimistic-lock version guard (skipped at total
  // 0). A lost race throws → the whole transaction (incl. the claim above) rolls
  // back and the caller retries, re-reading fresh state.
  let walletAfter = balanceBefore;
  if (total.gt(0) && req.user.wallet) {
    const upd = await tx.wallet.updateMany({
      where: { userId: req.userId, version: req.user.wallet.version, balanceAmount: { gte: total } },
      data: { balanceAmount: { decrement: total }, version: { increment: 1 } },
    });
    if (upd.count !== 1) throw new FulfillConflictError();
    const w = await tx.wallet.findUnique({ where: { userId: req.userId } });
    walletAfter = w?.balanceAmount ?? ZERO;
  }

  // 9. Post one redemption per line (+ a DR ledger row), running the balance down.
  let running = balanceBefore;
  for (const line of lines) {
    const redemption = await tx.redemption.create({
      data: {
        clientUuid: randomUUID(), // per-line ledger key; request-level idempotency is the status CAS above
        userId: req.userId,
        cardId: card.id,
        mealTypeId: line.mealTypeId,
        counterId: counter.id,
        categoryId: req.user.categoryId,
        paidBy: "wallet",
        rateApplied: line.sale,
        amount: line.sale,
        vendorAmount: line.vendor,
        appUserId: p.vendorAppUserId,
        foodRequestId: req.id,
        status: "posted",
        redeemedAt: p.at,
      },
    });
    if (line.sale.gt(0) && req.user.wallet) {
      running = running.minus(line.sale);
      await tx.walletTransaction.create({
        data: {
          walletId: req.user.wallet.id,
          userId: req.userId,
          txnType: "DR",
          sourceTable: "redemption",
          sourceId: redemption.id,
          amount: line.sale,
          balanceAfter: running,
          reference: `food request ${req.code}`,
        },
      });
    }
  }

  // Reconciliation guard: the per-line DR rows must sum to the wallet decrement.
  // A drift means the ledger and cached balance disagree — fail loudly, never
  // commit an inconsistent ledger.
  if (total.gt(0) && !running.equals(walletAfter)) {
    throw new Error("food-request fulfilment ledger drift — refusing to commit");
  }

  // 10. Record the delivery on the timeline (status was set by the claim in step 7).
  await tx.foodRequestEvent.create({
    data: { requestId: req.id, fromStatus: "out_for_delivery", toStatus: "delivered", note: "Delivered — RFID verified", appUserId: p.vendorAppUserId },
  });

  return {
    status: "DELIVERED",
    reason: "Delivered",
    charged: total.toFixed(2),
    cardholder: ch(walletAfter),
    requestId: req.id.toString(),
  };
}
