import { prisma } from "./prisma";
import { writeAudit } from "./audit";
import { formatDateTimeInZone } from "./time";
import { emitNotification } from "./notifications/notify";
import {
  tapEngine,
  isRetryableTapError,
  type TapParams,
  type TapResult,
} from "@/services/consumption";

const MAX_RETRIES = 4;

/** Post-commit "coupon utilized" notification for a freshly APPROVED tap (not a
 *  replay). Best-effort — a notification problem never affects the tap result. */
async function notifyCouponUtilized(result: TapResult, params: TapParams, counterId: bigint): Promise<void> {
  try {
    if (result.status !== "APPROVED" || result.reason === "Already recorded" || !result.cardholder) return;
    const [user, counter] = await Promise.all([
      prisma.user.findUnique({
        where: { id: BigInt(result.cardholder.id) },
        select: { email: true, phone: true, branchId: true },
      }),
      prisma.counter.findUnique({ where: { id: counterId }, select: { name: true } }),
    ]);
    await emitNotification("coupon.utilized", {
      vars: {
        name: result.cardholder.name,
        code: result.cardholder.code,
        meal: result.meal?.name ?? "",
        counter: counter?.name ?? "",
        remaining: String(result.cardholder.couponsRemaining),
        time: formatDateTimeInZone(params.at),
      },
      cardholder: user ? { email: user.email, phone: user.phone, branchId: user.branchId } : null,
    });
  } catch (e) {
    console.error("coupon.utilized notification failed:", e);
  }
}

/**
 * Record a REJECTED / BLOCKED tap in the audit trail so it surfaces in
 * Reports → Audit log with the reason, time, operator, and cardholder. A
 * rejected tap mutates nothing (no charge, no redemption), so this is a
 * standalone audit write — not part of the tap transaction. Best-effort: an
 * audit failure must never change the tap result the operator sees.
 *
 * Not idempotent by design: rejections persist nothing to key off, so a
 * re-sent/re-synced rejected tap logs each attempt — an honest record of every
 * declined tap, consistent with the append-only audit contract.
 */
async function auditRejectedTap(result: TapResult, params: TapParams, audit: { appUserId: bigint; counterId: bigint }): Promise<void> {
  try {
    if (result.status === "APPROVED") return;
    await writeAudit({
      appUserId: audit.appUserId,
      action: result.status === "BLOCKED" ? "tap.block" : "tap.reject",
      entity: "tap",
      after: {
        status: result.status,
        reason: result.reason,
        cardUid: params.cardUid,
        cardholder: result.cardholder?.name ?? null,
        code: result.cardholder?.code ?? null,
        category: result.cardholder?.category ?? null,
        meal: result.meal?.name ?? null,
        counterId: audit.counterId.toString(),
        synced: Boolean(params.syncedAt),
      },
    });
  } catch (e) {
    console.error("tap rejection audit failed:", e);
  }
}

/**
 * Run one tap through the consumption engine inside a single `$transaction`,
 * writing the approval audit row in the SAME transaction (api.md). Retries the
 * whole transaction on an optimistic-lock conflict / write-conflict / duplicate
 * `client_uuid` (a concurrent replay), so the contract — "a replayed tap returns
 * the original result, never charges twice" — holds even under concurrency.
 */
export async function runTap(
  params: TapParams,
  audit: { appUserId: bigint; counterId: bigint },
): Promise<TapResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const r = await tapEngine(tx, params);
        if (r.status === "APPROVED" && r.redemptionId) {
          await writeAudit(
            {
              appUserId: audit.appUserId,
              action: "tap.approve",
              entity: "redemption",
              entityId: BigInt(r.redemptionId),
              after: {
                paidBy: r.paidBy,
                charged: r.charged,
                meal: r.meal?.name,
                counterId: audit.counterId.toString(),
                synced: Boolean(params.syncedAt),
              },
            },
            tx,
          );
        }
        return r;
      });
      await auditRejectedTap(result, params, audit);
      await notifyCouponUtilized(result, params, audit.counterId);
      return result;
    } catch (e) {
      if (isRetryableTapError(e) && attempt < MAX_RETRIES) continue;
      throw e;
    }
  }
}
