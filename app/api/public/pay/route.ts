import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { publicCodeSchema } from "@/lib/public-schema";
import { defaultRatesForCategory } from "@/services/pricing";
import { couponValue } from "@/services/recharge";
import { localDateValue } from "@/lib/time";
import { createJodoOrder, resolveJodoConfig } from "@/lib/jodo";
import { normalizePhone, normalizeEmail } from "@/lib/contact";

const schema = z.object({
  code: publicCodeSchema,
  // Optional: the client only sends these when they aren't already on file.
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().max(150).optional(),
  items: z.array(z.object({ mealId: z.string().min(1), qty: z.number().int().min(0).max(999) })).min(1),
});

/**
 * POST /api/public/pay — start a self-service top-up payment. Recomputes the
 * amount server-side from the catalog rates (never trusts the client), resolves
 * the cardholder's branch collector code, and creates a Jodo order. Returns the
 * payment URL to redirect to. Does NOT credit anything — the wallet/coupons are
 * only credited once payment is confirmed (callback — a later step).
 */
export async function POST(req: Request) {
  const rl = rateLimit(`pub-pay:${clientIp(req.headers)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { code: { equals: parsed.data.code, mode: "insensitive" }, deletedAt: null },
  });
  if (!user) return NextResponse.json({ error: "No record found for that ID." }, { status: 404 });
  if (user.status !== "active" || user.validityExpired) {
    return NextResponse.json({ error: "This account can't recharge online right now." }, { status: 422 });
  }

  // Per-branch payment config from `payment_config` — collector code + base URL +
  // API key/secret must all be set for this branch, or there's no online top-up.
  const cfg = await resolveJodoConfig(user.branchId);
  if (!cfg) {
    return NextResponse.json({ error: "Online payment isn't set up for your branch yet. Please pay at the mess office." }, { status: 422 });
  }

  // Prefer a valid client-supplied contact (typed when none is on file); otherwise
  // reuse the cardholder's stored phone/email. Jodo requires both.
  const phone = normalizePhone(parsed.data.phone) ?? normalizePhone(user.phone);
  const email = normalizeEmail(parsed.data.email) ?? normalizeEmail(user.email);
  if (!phone) return NextResponse.json({ error: "A valid 10-digit phone number is required." }, { status: 422 });
  if (!email) return NextResponse.json({ error: "A valid email address is required." }, { status: 422 });

  // Recompute the amount from the catalog — the client-sent total is never
  // trusted. Money math stays Decimal (couponValue, the same pricer the credit
  // path uses); the float conversion happens only at the Jodo JSON boundary.
  const today = localDateValue(new Date());
  const rates = await defaultRatesForCategory(prisma, { branchId: user.branchId, categoryId: user.categoryId, today });
  const items = parsed.data.items
    .filter((it) => it.qty > 0)
    .map((it) => ({ mealTypeId: it.mealId, qty: it.qty }));
  const valued = couponValue(items.map((it) => ({ mealTypeId: it.mealTypeId, count: it.qty })), rates);
  if ("missingMeal" in valued) {
    return NextResponse.json({ error: "A selected meal has no current rate." }, { status: 422 });
  }
  const total = valued.value; // Decimal, 2dp rates × integer counts
  if (total.lte(0)) return NextResponse.json({ error: "Add at least one coupon to continue." }, { status: 422 });
  const amountStr = total.toFixed(2);

  const appUrl = (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  const order = await createJodoOrder(cfg, {
    name: user.fullName,
    phone,
    email,
    collectorCode: cfg.collectorCode,
    amount: Number(amountStr), // Jodo JSON boundary — exact after toFixed(2)
    callbackUrl: `${appUrl}/api/public/pay/callback`,
  });

  if (!order.ok) {
    console.error("Jodo order failed:", order.error, order.raw);
    return NextResponse.json({ error: order.error }, { status: 502 });
  }
  if (!order.orderId) {
    console.error("Jodo order has no id; cannot reconcile:", order.raw);
    return NextResponse.json({ error: "Payment gateway returned an unexpected response." }, { status: 502 });
  }

  // Remember what to credit once Jodo confirms this order is paid (callback).
  await prisma.paymentOrder.create({
    data: {
      jodoOrderId: order.orderId,
      clientUuid: crypto.randomUUID(),
      userId: user.id,
      branchId: user.branchId,
      amount: new Prisma.Decimal(amountStr),
      items,
      status: "pending",
    },
  });

  return NextResponse.json({ paymentUrl: order.paymentUrl, amount: amountStr }, { headers: { "Cache-Control": "no-store" } });
}
