import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { publicCodeSchema } from "@/lib/public-schema";
import { defaultRatesForCategory } from "@/services/pricing";
import { localDateValue } from "@/lib/time";
import { createJodoOrder } from "@/lib/jodo";
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
    include: { branch: { select: { collectorCode: true } } },
  });
  if (!user) return NextResponse.json({ error: "No record found for that ID." }, { status: 404 });
  if (user.status !== "active" || user.validityExpired) {
    return NextResponse.json({ error: "This account can't recharge online right now." }, { status: 422 });
  }

  const collectorCode = user.branch?.collectorCode;
  if (!collectorCode) {
    return NextResponse.json({ error: "Online payment isn't set up for your branch yet. Please pay at the mess office." }, { status: 422 });
  }

  // Prefer a valid client-supplied contact (typed when none is on file); otherwise
  // reuse the cardholder's stored phone/email. Jodo requires both.
  const phone = normalizePhone(parsed.data.phone) ?? normalizePhone(user.phone);
  const email = normalizeEmail(parsed.data.email) ?? normalizeEmail(user.email);
  if (!phone) return NextResponse.json({ error: "A valid 10-digit phone number is required." }, { status: 422 });
  if (!email) return NextResponse.json({ error: "A valid email address is required." }, { status: 422 });

  // Recompute the amount from the catalog — the client-sent total is never trusted.
  const today = localDateValue(new Date());
  const rates = await defaultRatesForCategory(prisma, { branchId: user.branchId, categoryId: user.categoryId, today });
  let amount = 0;
  const items: { mealTypeId: string; qty: number }[] = [];
  for (const it of parsed.data.items) {
    if (it.qty <= 0) continue;
    const price = rates[it.mealId];
    if (!price) return NextResponse.json({ error: "A selected meal has no current rate." }, { status: 422 });
    amount += Number.parseFloat(price) * it.qty;
    items.push({ mealTypeId: it.mealId, qty: it.qty });
  }
  amount = Number(amount.toFixed(2));
  if (amount <= 0) return NextResponse.json({ error: "Add at least one coupon to continue." }, { status: 422 });

  const appUrl = (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  const order = await createJodoOrder({
    name: user.fullName,
    phone,
    email,
    collectorCode,
    amount,
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
      amount: new Prisma.Decimal(amount.toFixed(2)),
      items,
      status: "pending",
    },
  });

  return NextResponse.json({ paymentUrl: order.paymentUrl, amount: amount.toFixed(2) }, { headers: { "Cache-Control": "no-store" } });
}
