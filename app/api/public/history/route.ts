import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { toCsv } from "@/lib/csv";
import { resolveDateRange } from "@/services/reporting";
import { publicCodeSchema } from "@/lib/public-schema";
import { getPublicHistory } from "@/services/public-lookup";

/**
 * GET /api/public/history?code=...&from=&to=&format=csv|json — unauthenticated,
 * rate-limited self-service consumption history, date-filtered. `format=csv`
 * streams a download. Minimal fields only (date / meal / paid by / amount).
 */
export async function GET(req: Request) {
  const rl = rateLimit(`pub-history:${clientIp(req.headers)}`, 15, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const url = new URL(req.url);
  const parsed = publicCodeSchema.safeParse(url.searchParams.get("code") ?? "");
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid ID." }, { status: 400 });
  }

  const range = resolveDateRange(
    url.searchParams.get("from") ?? undefined,
    url.searchParams.get("to") ?? undefined,
    new Date(),
  );
  const result = await getPublicHistory(prisma, parsed.data, range.from, range.toExclusive);
  if (!result) {
    return NextResponse.json({ error: "No record found for that ID." }, { status: 404 });
  }

  if (url.searchParams.get("format") === "csv") {
    const header = ["date", "meal", "paidBy", "amount"];
    const rows = result.rows.map((r) => [r.date, r.meal, r.paidBy, r.amount]);
    const csv = toCsv([header, ...rows]);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="history_${parsed.data}_${range.fromStr}_${range.toStr}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(
    { name: result.name, from: range.fromStr, to: range.toStr, rows: result.rows },
    { headers: { "Cache-Control": "no-store" } },
  );
}
