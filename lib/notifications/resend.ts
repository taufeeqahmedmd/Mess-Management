import type { NotificationLog } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail, sendWhatsApp, sendPush, type SendOutcome } from "./senders";

/**
 * Re-attempt one outbox row from its stored channel payload (`meta`) and update
 * the row in place — the shared engine behind the daily-digest flush and the
 * per-row Retry button. Rows are self-contained: email carries its sending
 * entity, whatsapp its template name/language/params, push its app_user
 * recipient — so no rule/template re-resolution is needed (and a retry works
 * even if the rule has since been edited).
 */
export async function resendLogRow(row: NotificationLog): Promise<SendOutcome> {
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
      templateName: typeof meta.templateName === "string" ? meta.templateName : null,
      language: typeof meta.language === "string" ? meta.language : null,
      userName: typeof meta.userName === "string" ? meta.userName : "Customer",
      params: Array.isArray(meta.variables) ? meta.variables.map(String) : [],
    });
  }

  await prisma.notificationLog.update({
    where: { id: row.id },
    data: {
      status: outcome.status,
      error:
        "reason" in outcome ? outcome.reason.slice(0, 500) : "error" in outcome ? outcome.error.slice(0, 500) : null,
      sentAt: outcome.status === "sent" ? new Date() : null,
    },
  });

  return outcome;
}
