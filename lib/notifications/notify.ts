import { Prisma } from "@prisma/client";
import type { NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notificationEvent, waParamValues } from "@/services/notification-events";
import { parseRecipients, renderTemplate, fallbackBody } from "@/services/notifications";
import { sendEmail, sendWhatsApp, sendPush, type SendOutcome } from "./senders";

/**
 * Notification dispatcher. Called from server actions/routes AFTER the business
 * transaction commits; every emission is best-effort — a notification failure
 * must never fail or roll back the business write, so callers go through
 * `emitNotification`, which swallows (and logs) everything.
 *
 * For each enabled rule (event × channel) it resolves recipients, renders the
 * template, writes an outbox row (notification_logs), and hands it to the
 * channel sender. Frequency: `instant` sends now; `daily_digest` rows stay
 * `pending` for a future scheduled sweep.
 */

export type NotifyContext = {
  /** Template variables — every value already formatted for display. */
  vars: Record<string, string>;
  /** The affected cardholder's contact + branch (for the email entity). */
  cardholder?: { email?: string | null; phone?: string | null; branchId?: bigint | null } | null;
  /** Vendor whose staff logins should be notified (foodRequest events). */
  vendorId?: bigint | null;
  /** Staff login that raised the request (foodRequest events). */
  requesterAppUserId?: bigint | null;
};

type StaffContact = { id: bigint; email: string | null; mobile: string };

async function staffRecipients(cfg: ReturnType<typeof parseRecipients>, ctx: NotifyContext): Promise<StaffContact[]> {
  const ors: Prisma.AppUserWhereInput[] = [];
  if (cfg.roles.length > 0) ors.push({ role: { name: { in: cfg.roles } } });
  if (cfg.vendor && ctx.vendorId) ors.push({ vendorId: ctx.vendorId });
  if (cfg.requester && ctx.requesterAppUserId) ors.push({ id: ctx.requesterAppUserId });
  if (ors.length === 0) return [];
  const rows = await prisma.appUser.findMany({
    where: { deletedAt: null, status: "active", OR: ors },
    select: { id: true, email: true, mobile: true },
  });
  return rows;
}

/** The email entity (Pallavi/DPS) that mails a branch's cardholders; falls back to the first active entity. */
async function emailEntityFor(branchId: bigint | null | undefined) {
  if (branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, include: { emailEntity: true } });
    if (branch?.emailEntity?.active) return branch.emailEntity;
  }
  return prisma.emailEntity.findFirst({ where: { active: true }, orderBy: { id: "asc" } });
}

async function writeLog(p: {
  eventCode: string;
  channel: NotificationChannel;
  recipient: string;
  title: string | null;
  body: string;
  meta?: Prisma.InputJsonValue;
  outcome: SendOutcome | { status: "pending"; reason: string };
}) {
  const status = p.outcome.status === "sent" ? "sent" : p.outcome.status === "failed" ? "failed" : p.outcome.status;
  await prisma.notificationLog.create({
    data: {
      eventCode: p.eventCode,
      channel: p.channel,
      recipient: p.recipient.slice(0, 255),
      title: p.title,
      body: p.body,
      meta: p.meta ?? Prisma.JsonNull,
      status: status === "pending" ? "pending" : status,
      error:
        "reason" in p.outcome ? p.outcome.reason.slice(0, 500) : "error" in p.outcome ? p.outcome.error.slice(0, 500) : null,
      sentAt: p.outcome.status === "sent" ? new Date() : null,
    },
  });
}

async function dispatchRule(
  rule: Prisma.NotificationRuleGetPayload<{ include: { template: true } }>,
  eventCode: string,
  ctx: NotifyContext,
): Promise<void> {
  const def = notificationEvent(eventCode);
  const cfg = parseRecipients(rule.recipients);
  const label = def?.label ?? eventCode;

  const title = rule.template?.title ? renderTemplate(rule.template.title, ctx.vars) : label;
  const body = rule.template?.body ? renderTemplate(rule.template.body, ctx.vars) : fallbackBody(label, ctx.vars);
  const digest = rule.frequency !== "instant";
  const digestOutcome = { status: "pending", reason: "Queued for daily digest (scheduler pending)" } as const;

  if (rule.channel === "push") {
    const staff = await staffRecipients(cfg, ctx);
    for (const s of staff) {
      const outcome = digest ? digestOutcome : await sendPush({ appUserId: s.id, title, body });
      await writeLog({ eventCode, channel: "push", recipient: `app_user:${s.id}`, title, body, outcome });
    }
    return;
  }

  if (rule.channel === "email") {
    const targets: string[] = [];
    if (cfg.cardholder && ctx.cardholder?.email) targets.push(ctx.cardholder.email);
    for (const s of await staffRecipients(cfg, ctx)) if (s.email) targets.push(s.email);
    if (targets.length === 0) return;
    const entity = await emailEntityFor(ctx.cardholder?.branchId);
    const meta = entity
      ? { envPrefix: entity.envPrefix, fromName: entity.fromName, fromEmail: entity.fromEmail }
      : undefined;
    for (const to of [...new Set(targets)]) {
      const outcome: SendOutcome | typeof digestOutcome = digest
        ? digestOutcome
        : entity
          ? await sendEmail({ envPrefix: entity.envPrefix, fromName: entity.fromName, fromEmail: entity.fromEmail, to, subject: title, body })
          : { status: "skipped", reason: "No active email entity configured" };
      await writeLog({ eventCode, channel: "email", recipient: to, title, body, meta, outcome });
    }
    return;
  }

  // whatsapp — the approved template (synced from Smartping's Partner API) is
  // what's actually sent; the app only fills its positional params from the
  // event (waParams), in order. `waTemplateId` on the selected row = template name.
  const phones: string[] = [];
  if (cfg.cardholder && ctx.cardholder?.phone) phones.push(ctx.cardholder.phone);
  for (const s of await staffRecipients(cfg, ctx)) if (s.mobile) phones.push(s.mobile);
  if (phones.length === 0) return;
  const templateName = rule.template?.waTemplateId ?? null;
  const language = rule.template?.waLanguage ?? null;
  const waVars = waParamValues(eventCode, ctx.vars);
  const userName = ctx.vars.name || ctx.vars.cardholder || "Customer";
  const waMeta = { templateName, language, userName, variables: waVars };
  // Log preview: fill the template's positional {{1}},{{2}},… so the outbox shows
  // the message as delivered (the send itself carries `params`, not this text).
  const waBody = body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n: string) => waVars[Number(n) - 1] ?? "");
  for (const phone of [...new Set(phones)]) {
    const outcome = digest
      ? digestOutcome
      : await sendWhatsApp({ phone, templateName, language, userName, params: waVars });
    await writeLog({ eventCode, channel: "whatsapp", recipient: phone, title: null, body: waBody, meta: waMeta, outcome });
  }
}

/** The public self-service address for message links (e.g. "mm.k-innovative.com"),
 *  derived from APP_URL — available to every event as {{link}}. */
function publicLink(): string {
  return (process.env.APP_URL ?? "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Emit an application event to every enabled notification rule. Best-effort:
 * never throws — callers invoke it after their transaction commits and must not
 * be failed by notification problems.
 */
export async function emitNotification(eventCode: string, ctx: NotifyContext): Promise<void> {
  try {
    // Common variables every event carries; explicit ctx.vars win on collision.
    const enriched: NotifyContext = { ...ctx, vars: { link: publicLink(), ...ctx.vars } };
    const rules = await prisma.notificationRule.findMany({
      where: { eventCode, enabled: true },
      include: { template: true },
    });
    for (const rule of rules) {
      try {
        await dispatchRule(rule, eventCode, enriched);
      } catch (e) {
        console.error(`notification dispatch failed (${eventCode}/${rule.channel}):`, e);
      }
    }
  } catch (e) {
    console.error(`notification emit failed (${eventCode}):`, e);
  }
}
