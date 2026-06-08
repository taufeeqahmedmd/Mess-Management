import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { publicCodeSchema } from "@/lib/public-schema";
import { getPublicBalance } from "@/services/public-lookup";

/**
 * GET /api/public/balance?code=... — unauthenticated, rate-limited self-service
 * balance lookup. Hostile input: validate, rate-limit, return only the minimum
 * fields, and never leak whether a near-miss code exists (generic 404).
 */
export async function GET(req: Request) {
  const rl = rateLimit(`pub-balance:${clientIp(req.headers)}`, 20, 60_000);
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

  const balance = await getPublicBalance(prisma, parsed.data);
  if (!balance) {
    return NextResponse.json({ error: "No record found for that ID." }, { status: 404 });
  }

  return NextResponse.json(balance, { headers: { "Cache-Control": "no-store" } });
}
