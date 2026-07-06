import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { resendLogRow } from "@/lib/notifications/resend";

/**
 * POST /api/notifications/digest — flush pending (daily-digest) outbox rows.
 * Intended to be hit once a day by the server's scheduler:
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" https://…/api/notifications/digest
 * Also callable by a logged-in actor holding notifications.manage (manual run).
 * Each row carries its channel payload in `meta` (see lib/notifications/resend),
 * so the flush needs no rule re-resolution; rows flip to sent/failed/skipped
 * exactly like instant sends.
 */
export async function POST(req: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const bySecret = Boolean(secret) && req.headers.get("x-cron-secret") === secret;
  if (!bySecret) {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!can(actor, "notifications.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pending = await prisma.notificationLog.findMany({
    where: { status: "pending" },
    orderBy: { id: "asc" },
    take: 500,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of pending) {
    const outcome = await resendLogRow(row);
    if (outcome.status === "sent") sent++;
    else if (outcome.status === "failed") failed++;
    else skipped++;
  }

  return NextResponse.json({ processed: pending.length, sent, failed, skipped });
}
