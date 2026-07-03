import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { sendEmail, sendWhatsApp, sendPush, type SendOutcome } from "@/lib/notifications/senders";

/**
 * POST /api/notifications/digest — flush pending (daily-digest) outbox rows.
 * Intended to be hit once a day by the server's scheduler:
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" https://…/api/notifications/digest
 * Also callable by a logged-in actor holding notifications.manage (manual run).
 * Each row carries its channel payload in `meta`, so the flush needs no rule
 * re-resolution; rows flip to sent/failed/skipped exactly like instant sends.
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
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    let outcome: SendOutcome;

    if (row.channel === "push") {
      const idStr = row.recipient.startsWith("app_user:") ? row.recipient.slice("app_user:".length) : "";
      let appUserId: bigint | null = null;
      try {
        appUserId = idStr ? BigInt(idStr) : null;
      } catch {
        appUserId = null;
      }
      outcome = appUserId
        ? await sendPush({ appUserId, title: row.title ?? "Mess Management", body: row.body })
        : { status: "skipped", reason: "Unresolvable push recipient" };
    } else if (row.channel === "email") {
      const envPrefix = typeof meta.envPrefix === "string" ? meta.envPrefix : "";
      outcome = envPrefix
        ? await sendEmail({
            envPrefix,
            fromName: typeof meta.fromName === "string" ? meta.fromName : "Mess Management",
            fromEmail: typeof meta.fromEmail === "string" ? meta.fromEmail : "",
            to: row.recipient,
            subject: row.title ?? "Mess Management",
            body: row.body,
          })
        : { status: "skipped", reason: "No email entity stored on this row" };
    } else {
      outcome = await sendWhatsApp({
        phone: row.recipient,
        waTemplateId: typeof meta.waTemplateId === "string" ? meta.waTemplateId : null,
        variables: Array.isArray(meta.variables) ? meta.variables.map(String) : [],
        body: row.body,
      });
    }

    await prisma.notificationLog.update({
      where: { id: row.id },
      data: {
        status: outcome.status,
        error: "reason" in outcome ? outcome.reason.slice(0, 500) : "error" in outcome ? outcome.error.slice(0, 500) : null,
        sentAt: outcome.status === "sent" ? new Date() : null,
      },
    });
    if (outcome.status === "sent") sent++;
    else if (outcome.status === "failed") failed++;
    else skipped++;
  }

  return NextResponse.json({ processed: pending.length, sent, failed, skipped });
}
