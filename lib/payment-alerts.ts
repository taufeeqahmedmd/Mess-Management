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
export async function raisePaymentAlert(alert: PaymentAlert, health: PaymentHealth): Promise<boolean> {
  try {
    const recent = await prisma.notificationLog.findFirst({
      where: { eventCode: PAYMENT_ALERT_EVENT, createdAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_MS) } },
      select: { id: true },
    });
    if (recent) return false;
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
