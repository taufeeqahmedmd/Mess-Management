import { prisma } from "@/lib/prisma";
import { emitNotification } from "@/lib/notifications/notify";
import type { PaymentAlert, PaymentHealth } from "@/services/payment-webhook";

export const PAYMENT_ALERT_EVENT = "payments.webhook_alert";
/** Minimum gap between alerts — the safety net runs every 5 minutes; a human doesn't need 288 emails. */
const ALERT_COOLDOWN_MS = 6 * 60 * 60_000;

/**
 * Raise a staff alert for a payments-health finding, at most once per cooldown
 * window (deduped on the notification outbox, so it survives restarts). Which
 * channels/roles receive it is data — a rule on `payments.webhook_alert` in
 * Notifications Management. Best-effort: never throws, never blocks the sweep.
 * Returns true when an alert was actually emitted this call.
 */
// In-process cooldown as well: the outbox only has rows when a rule is enabled,
// and the sweep must not log the same finding every 5 minutes before that.
let lastRaisedAt = 0;

export async function raisePaymentAlert(alert: PaymentAlert, health: PaymentHealth): Promise<boolean> {
  try {
    if (Date.now() - lastRaisedAt < ALERT_COOLDOWN_MS) return false;
    const recent = await prisma.notificationLog.findFirst({
      where: { eventCode: PAYMENT_ALERT_EVENT, createdAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_MS) } },
      select: { id: true },
    });
    if (recent) {
      lastRaisedAt = Date.now();
      return false;
    }
    lastRaisedAt = Date.now();
    await emitNotification(PAYMENT_ALERT_EVENT, {
      vars: {
        reason: alert.reason,
        ordersLast24h: String(health.ordersLast24h),
        webhookEventsLast24h: String(health.webhookEventsLast24h),
        creditedBySafetyNet: String(health.creditedBySafetyNet),
        stuckOrders: String(health.stuckOrders),
      },
    });
    console.error(`payments alert (${alert.key}): ${alert.reason}`);
    return true;
  } catch (e) {
    console.error("payments alert failed:", e);
    return false;
  }
}
