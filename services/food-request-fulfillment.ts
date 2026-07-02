/**
 * Food-request delivery fulfilment (plan.md §15.2), run inside one `$transaction`.
 * Mirrors the counter tap engine's discipline, but is coupon-only — a delivery
 * records consumption for settlement/reports WITHOUT deducting from the
 * cardholder (the retired wallet is no longer charged; delivery is fulfilment,
 * not billing):
 *
 *  - RFID verification: the tapped card must resolve to the request's
 *    cardholder's ACTIVE card, else delivery is blocked.
 *  - The delivery lands as `redemption` rows (one per request line) on the
 *    branch's "Food Requests" virtual counter — the SAME table as a counter tap,
 *    carrying the sale + vendor amounts so settlement/reports include it with no
 *    query changes. No balance is debited and no `*_transactions` row is written.
 *  - Idempotent on the request: a re-tap of an already-delivered request returns
 *    the original result and never double-posts.
 *
 * The recorded amount is RECOMPUTED from the request's line snapshots — never
 * trusted from a client.
 */

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

const ZERO = new Prisma.Decimal(0);

/** Thrown when an optimistic-lock guard loses a race; caller retries. */
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
  cardholder?: { name: string; code: string };
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
      user: { include: { category: true } },
    },
  });
  if (!req) return { status: "REJECTED", reason: "Request not found." };

  const ch = () => ({ name: req.user.fullName, code: req.user.code });

  // 1. Idempotency — an already-delivered request returns its original result.
  if (req.status === "delivered") {
    return {
      status: "DELIVERED",
      reason: "Already delivered",
      charged: req.amount.toFixed(2),
      cardholder: ch(),
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

  // 5. Recompute the delivered value from the line snapshots — never trust the
  // cached total. `sale` is the list value (reporting), `vendor` the settlement
  // cost owed to the caterer. Nothing is debited from the cardholder.
  const lines = req.items.map((it) => ({
    mealTypeId: it.mealTypeId,
    sale: it.unitPrice.mul(it.qty),
    vendor: it.unitVendorPrice.mul(it.qty),
  }));
  const total = lines.reduce<Prisma.Decimal>((s, l) => s.plus(l.sale), ZERO);

  // 6. Claim the delivery atomically. This compare-and-swap on `status` serialises
  // concurrent / double-submitted deliveries so only ONE caller posts the
  // redemptions. The loser re-reads and returns the original result idempotently.
  const claim = await tx.foodRequest.updateMany({
    where: { id: req.id, status: "out_for_delivery" },
    data: { status: "delivered", deliveredAt: p.at, cardIdUsed: card.id, fulfilledClientUuid: p.clientUuid },
  });
  if (claim.count !== 1) {
    const fresh = await tx.foodRequest.findUnique({ where: { id: req.id } });
    if (fresh?.status === "delivered") {
      return {
        status: "DELIVERED",
        reason: "Already delivered",
        charged: fresh.amount.toFixed(2),
        cardholder: ch(),
        requestId: req.id.toString(),
      };
    }
    return { status: "REJECTED", reason: "Could not complete delivery — please retry." };
  }

  // 7. Post one redemption per line on the Food Requests counter, carrying the
  // sale + vendor amounts for reports/settlement. Coupon-only fulfilment: no
  // balance is debited and no cardholder ledger row is written.
  for (const line of lines) {
    await tx.redemption.create({
      data: {
        clientUuid: randomUUID(), // per-line key; request-level idempotency is the status CAS above
        userId: req.userId,
        cardId: card.id,
        mealTypeId: line.mealTypeId,
        counterId: counter.id,
        categoryId: req.user.categoryId,
        paidBy: null,
        rateApplied: line.sale,
        amount: ZERO,
        vendorAmount: line.vendor,
        appUserId: p.vendorAppUserId,
        foodRequestId: req.id,
        status: "posted",
        redeemedAt: p.at,
      },
    });
  }

  // 8. Record the delivery on the timeline (status was set by the claim in step 6).
  await tx.foodRequestEvent.create({
    data: { requestId: req.id, fromStatus: "out_for_delivery", toStatus: "delivered", note: "Delivered — RFID verified", appUserId: p.vendorAppUserId },
  });

  return {
    status: "DELIVERED",
    reason: "Delivered",
    charged: total.toFixed(2),
    cardholder: ch(),
    requestId: req.id.toString(),
  };
}
