import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { emitNotification } from "@/lib/notifications/notify";
import { applyRecharge } from "@/services/recharge-ledger";
import { defaultRatesForCategory } from "@/services/pricing";
import { couponValue } from "@/services/recharge";
import { localDateValue } from "@/lib/time";

/** Resolve (or create) the "Online" payment mode used for self-service top-ups. */
async function onlinePaymentModeId(tx: Prisma.TransactionClient): Promise<bigint> {
  const pm = await tx.paymentMode.upsert({
    where: { code: "ONLINE" },
    update: {},
    create: { code: "ONLINE", name: "Online (Jodo)" },
  });
  return pm.id;
}

type PaymentOrderRow = {
  id: bigint;
  clientUuid: string;
  userId: bigint;
  branchId: bigint;
  status: string;
  items: unknown;
};

export type CreditResult = { ok: true; already: boolean } | { ok: false; error: string };

/**
 * Credit a *confirmed-paid* online top-up: grant the coupons through the shared
 * recharge ledger (no wallet money — coupons are the balance) and mark the order
 * credited. Idempotent two ways: the order status short-circuits a replay, and
 * the recharge is keyed on the order's `clientUuid` (unique) so a race can't
 * double-credit. Amount is recomputed from the catalog — never trusted from input.
 */
export async function creditPaymentOrder(
  order: PaymentOrderRow,
  transactionId: string | null,
  opts: {
    paidAt?: Date | null;
    /** Set when an operator credits the order after verifying payment in the
     *  Jodo dashboard (gateway unreachable) — recorded on the recharge + audit. */
    manual?: { by: string };
    /** Set when an operator re-credits an order whose recharge was reversed by
     *  mistake. The order's clientUuid is already spent by the reversed
     *  recharge, so a fresh idempotency key is used — which is exactly why
     *  this path is operator-only and audited with who/why. */
    recredit?: { by: string; reason: string };
  } = {},
): Promise<CreditResult> {
  if (order.status === "credited") return { ok: true, already: true };
  if (opts.recredit && order.status !== "failed") return { ok: false, error: "Only a failed (reversed) order can be re-credited." };

  const rawItems = Array.isArray(order.items) ? (order.items as Array<{ mealTypeId?: unknown; qty?: unknown }>) : [];
  const coupons = rawItems
    .map((i) => ({ mealTypeId: String(i.mealTypeId ?? ""), count: Number(i.qty ?? 0) }))
    .filter((c) => c.mealTypeId && Number.isInteger(c.count) && c.count > 0);
  if (coupons.length === 0) return { ok: false, error: "Nothing to credit." };

  const user = await prisma.user.findUnique({
    where: { id: order.userId },
    select: { categoryId: true, branchId: true, fullName: true, code: true, phone: true, email: true },
  });
  if (!user) return { ok: false, error: "Cardholder not found." };

  const rates = await defaultRatesForCategory(prisma, {
    branchId: user.branchId,
    categoryId: user.categoryId,
    today: localDateValue(new Date()),
  });
  const valued = couponValue(coupons, rates);
  if ("missingMeal" in valued) return { ok: false, error: "A meal has no current rate." };
  const amount = new Prisma.Decimal(valued.value.toFixed(2));

  try {
    await prisma.$transaction(async (tx) => {
      const paymentModeId = await onlinePaymentModeId(tx);
      const r = await applyRecharge(tx, {
        userId: order.userId,
        amount,
        coupons: coupons.map((c) => ({ mealTypeId: BigInt(c.mealTypeId), count: c.count })),
        validFrom: null,
        validTill: null,
        paymentModeId,
        counterId: null,
        appUserId: null, // self-service — no operator
        remarks: opts.recredit
          ? `Online top-up (Jodo) — re-credited by ${opts.recredit.by} after an erroneous reversal: ${opts.recredit.reason}`.slice(0, 255)
          : opts.manual
            ? `Online top-up (Jodo) — credited manually by ${opts.manual.by} after dashboard verification`
            : "Online top-up (Jodo)",
        // The order's clientUuid is the idempotency key for its ONE recharge. A
        // re-credit follows a reversed recharge that already holds it, so it
        // gets a fresh key (operator-only, audited below).
        clientUuid: opts.recredit ? randomUUID() : order.clientUuid,
        transactionId,
      });
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { status: "credited", rechargeId: r.id, creditedAt: new Date(), paidAt: opts.paidAt ?? null, nextCheckAt: null },
      });
      await writeAudit(
        {
          appUserId: null,
          action: "recharge.online",
          entity: "recharge",
          entityId: r.id,
          after: {
            userId: order.userId.toString(),
            amount: amount.toFixed(2),
            coupons: coupons.length,
            paymentOrderId: order.id.toString(),
            ...(opts.manual ? { manual: true, verifiedBy: opts.manual.by } : {}),
            ...(opts.recredit ? { recredit: true, recreditedBy: opts.recredit.by, reason: opts.recredit.reason } : {}),
          },
        },
        tx,
      );
    });
  } catch (e) {
    // A concurrent callback already credited (unique clientUuid) → treat as done.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: true, already: true };
    }
    throw e;
  }

  await emitNotification("recharge.online_credited", {
    vars: {
      name: user.fullName,
      code: user.code,
      amount: amount.toFixed(2),
      coupons: String(coupons.reduce((s, c) => s + c.count, 0)),
      transactionId: transactionId ?? "",
    },
    cardholder: { email: user.email, phone: user.phone, branchId: user.branchId },
  });

  return { ok: true, already: false };
}
