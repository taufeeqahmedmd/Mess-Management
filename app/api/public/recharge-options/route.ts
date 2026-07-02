import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { publicCodeSchema } from "@/lib/public-schema";
import { getPublicRechargeOptions } from "@/services/public-lookup";

/**
 * GET /api/public/recharge-options?code=... — unauthenticated, rate-limited.
 * Returns the meals a cardholder can buy coupons for and the per-coupon price
 * for their category/branch, so the self-service top-up page can build the
 * coupons-per-meal order. Minimal fields; generic 404 for a missing code.
 */
export async function GET(req: Request) {
  const rl = rateLimit(`pub-recharge-opts:${clientIp(req.headers)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const parsed = publicCodeSchema.safeParse(new URL(req.url).searchParams.get("code") ?? "");
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid ID." }, { status: 400 });
  }

  const options = await getPublicRechargeOptions(prisma, parsed.data);
  if (!options) {
    return NextResponse.json({ error: "No record found for that ID." }, { status: 404 });
  }

  return NextResponse.json(options, { headers: { "Cache-Control": "no-store" } });
}
