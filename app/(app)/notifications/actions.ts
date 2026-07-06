"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type NotificationChannel, type NotificationFrequency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { notificationEvent } from "@/services/notification-events";
import { parseRecipients } from "@/services/notifications";
import { listPartnerTemplates } from "@/lib/notifications/smartping";
import { resendLogRow } from "@/lib/notifications/resend";

export type NotifyFormState = { error?: string; success?: boolean };

const CHANNELS: NotificationChannel[] = ["push", "email", "whatsapp"];
const FREQUENCIES: NotificationFrequency[] = ["instant", "daily_digest"];

const isChannel = (v: string): v is NotificationChannel => (CHANNELS as string[]).includes(v);
const isFrequency = (v: string): v is NotificationFrequency => (FREQUENCIES as string[]).includes(v);

function channelPath(channel: NotificationChannel): string {
  return `/notifications/${channel === "whatsapp" ? "whatsapp" : channel}`;
}

/**
 * Save one channel's event rules from the config grid. Payload (hidden field):
 * [{ eventCode, enabled, recipients, frequency, templateId }] — upserted on
 * (eventCode, channel). Unknown event codes are rejected (the catalog is code).
 */
export async function saveRulesAction(_prev: NotifyFormState, formData: FormData): Promise<NotifyFormState> {
  const actor = await requirePermission("notifications.manage");

  const channelRaw = String(formData.get("channel") ?? "");
  if (!isChannel(channelRaw)) return { error: "Invalid channel." };
  const channel = channelRaw;

  let rows: unknown;
  try {
    rows = JSON.parse(String(formData.get("payload") ?? "[]"));
  } catch {
    return { error: "Could not read the submitted rules." };
  }
  if (!Array.isArray(rows)) return { error: "Could not read the submitted rules." };

  type Row = {
    eventCode: string;
    enabled: boolean;
    recipients: ReturnType<typeof parseRecipients>;
    frequency: NotificationFrequency;
    templateId: bigint | null;
  };
  const parsed: Row[] = [];
  for (const raw of rows) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const eventCode = String(r.eventCode ?? "");
    if (!notificationEvent(eventCode)) return { error: `Unknown event: ${eventCode}` };
    const freqRaw = String(r.frequency ?? "instant");
    let templateId: bigint | null = null;
    if (r.templateId != null && String(r.templateId) !== "") {
      try {
        templateId = BigInt(String(r.templateId));
      } catch {
        return { error: "Invalid template selection." };
      }
    }
    parsed.push({
      eventCode,
      enabled: r.enabled === true,
      recipients: parseRecipients(r.recipients),
      frequency: isFrequency(freqRaw) ? freqRaw : "instant",
      templateId,
    });
  }

  // Templates must belong to this channel (a push rule can't render a WhatsApp template).
  const tplIds = parsed.map((p) => p.templateId).filter((id): id is bigint => id != null);
  if (tplIds.length > 0) {
    const owned = await prisma.notificationTemplate.findMany({
      where: { id: { in: tplIds }, channel },
      select: { id: true },
    });
    const ok = new Set(owned.map((t) => t.id.toString()));
    if (parsed.some((p) => p.templateId != null && !ok.has(p.templateId.toString()))) {
      return { error: "A selected template does not belong to this channel." };
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const p of parsed) {
      await tx.notificationRule.upsert({
        where: { eventCode_channel: { eventCode: p.eventCode, channel } },
        update: {
          enabled: p.enabled,
          recipients: p.recipients as unknown as Prisma.InputJsonValue,
          frequency: p.frequency,
          templateId: p.templateId,
        },
        create: {
          eventCode: p.eventCode,
          channel,
          enabled: p.enabled,
          recipients: p.recipients as unknown as Prisma.InputJsonValue,
          frequency: p.frequency,
          templateId: p.templateId,
        },
      });
    }
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "notifications.rules",
        entity: "notification_rule",
        after: { channel, events: parsed.length, enabled: parsed.filter((p) => p.enabled).length },
      },
      tx,
    );
  });

  revalidatePath(channelPath(channel));
  return { success: true };
}

/**
 * Create or update a template. Email/push: subject/title + body. WhatsApp: the
 * message content always lives in Smartping — a row here just REGISTERS it for
 * the event-rule dropdown: `waTemplateId` = the template name (Partner/Direct
 * send) or the Live API-Campaign name (campaign-API send), plus an optional
 * language + preview. Rows also arrive automatically via syncWhatsAppTemplates-
 * Action once a fetch credential exists; manual entry is the fallback until then.
 */
export async function saveTemplateAction(_prev: NotifyFormState, formData: FormData): Promise<NotifyFormState> {
  const actor = await requirePermission("notifications.manage");

  const channelRaw = String(formData.get("channel") ?? "");
  if (!isChannel(channelRaw)) return { error: "Invalid channel." };
  const channel = channelRaw;

  const idRaw = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const waTemplateId = String(formData.get("waTemplateId") ?? "").trim();
  const waLanguage = String(formData.get("waLanguage") ?? "").trim();
  const active = formData.get("active") !== "off";

  if (!name) return { error: "Name is required." };
  if (channel === "whatsapp") {
    if (!waTemplateId) return { error: "The Smartping template / campaign name is required." };
  } else {
    if (!body) return { error: "Body is required." };
    if (!title) {
      return { error: channel === "email" ? "Email subject is required." : "Push title is required." };
    }
  }

  const data = {
    channel,
    name,
    title: channel === "whatsapp" ? null : title,
    body: channel === "whatsapp" ? body || waTemplateId : body,
    waTemplateId: channel === "whatsapp" ? waTemplateId : null,
    waLanguage: channel === "whatsapp" ? waLanguage || "en" : null,
    waVariables: Prisma.JsonNull,
    active,
  };

  let id: bigint | null = null;
  if (idRaw) {
    try {
      id = BigInt(idRaw);
    } catch {
      return { error: "Invalid template." };
    }
    const existing = await prisma.notificationTemplate.findUnique({ where: { id } });
    if (!existing || existing.channel !== channel) return { error: "Template not found." };
  }

  await prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.notificationTemplate.update({ where: { id }, data })
      : await tx.notificationTemplate.create({ data });
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: id ? "notifications.template.update" : "notifications.template.create",
        entity: "notification_template",
        entityId: saved.id,
        after: { channel, name, waTemplateId: data.waTemplateId },
      },
      tx,
    );
  });

  revalidatePath(channelPath(channel));
  return { success: true };
}

/** Delete a template (rules referencing it fall back to the default body via ON DELETE SET NULL). */
export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("notifications.manage");
  let id: bigint;
  try {
    id = BigInt(String(formData.get("id") ?? ""));
  } catch {
    return;
  }
  const existing = await prisma.notificationTemplate.findUnique({ where: { id } });
  if (!existing) return;

  await prisma.$transaction(async (tx) => {
    await tx.notificationRule.updateMany({ where: { templateId: id }, data: { templateId: null } });
    await tx.notificationTemplate.delete({ where: { id } });
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "notifications.template.delete",
        entity: "notification_template",
        entityId: id,
        before: { name: existing.name, channel: existing.channel },
      },
      tx,
    );
  });

  revalidatePath(channelPath(existing.channel));
}

/** Update an email entity's sending identity (Pallavi / DPS). SMTP creds stay in env. */
export async function saveEntityAction(_prev: NotifyFormState, formData: FormData): Promise<NotifyFormState> {
  const actor = await requirePermission("notifications.manage");

  let id: bigint;
  try {
    id = BigInt(String(formData.get("id") ?? ""));
  } catch {
    return { error: "Invalid entity." };
  }
  const fromName = String(formData.get("fromName") ?? "").trim();
  const fromEmail = String(formData.get("fromEmail") ?? "").trim();
  const active = formData.get("active") === "on";
  if (!fromName) return { error: "From name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) return { error: "Enter a valid from email address." };

  const existing = await prisma.emailEntity.findUnique({ where: { id } });
  if (!existing) return { error: "Entity not found." };

  await prisma.$transaction(async (tx) => {
    await tx.emailEntity.update({ where: { id }, data: { fromName, fromEmail, active } });
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "notifications.entity.update",
        entity: "email_entity",
        entityId: id,
        before: { fromName: existing.fromName, fromEmail: existing.fromEmail, active: existing.active },
        after: { fromName, fromEmail, active },
      },
      tx,
    );
  });

  revalidatePath("/notifications/email");
  return { success: true };
}

// Branch → entity mapping is edited on the branch itself (Settings → Branches →
// Edit, `settings.manage`); the Entities tab shows it read-only.

/**
 * Pull the templates from Smartping's Partner API into the local read-only
 * mirror (spec: templates are created in Smartping; the app only fetches names).
 * Upserts by template name, refreshes body/language/param-count, keeps only
 * APPROVED templates active, and deactivates local rows that vanished from
 * Smartping (kept so historical logs/rules still resolve, but out of dropdowns).
 */
export async function syncWhatsAppTemplatesAction(): Promise<NotifyFormState> {
  const actor = await requirePermission("notifications.manage");

  const result = await listPartnerTemplates();
  if (!result.ok) return { error: result.error };

  const existing = await prisma.notificationTemplate.findMany({ where: { channel: "whatsapp" } });
  const byName = new Map(existing.filter((t) => t.waTemplateId).map((t) => [t.waTemplateId as string, t]));
  const seenActive = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const t of result.templates) {
      const approved = t.status.toUpperCase() === "APPROVED";
      if (approved) seenActive.add(t.name);
      const row = byName.get(t.name);
      const data = {
        channel: "whatsapp" as const,
        name: t.name,
        title: null,
        body: t.body || t.name,
        waTemplateId: t.name,
        waLanguage: t.language,
        // Positional markers {{1}}..{{N}} — display-only param count; the send
        // fills them from the event's waParams.
        waVariables:
          t.paramCount > 0
            ? (Array.from({ length: t.paramCount }, (_, i) => String(i + 1)) as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        active: approved,
      };
      if (row) await tx.notificationTemplate.update({ where: { id: row.id }, data });
      else await tx.notificationTemplate.create({ data });
    }
    const stale = existing
      .filter((t) => t.active && (!t.waTemplateId || !seenActive.has(t.waTemplateId)))
      .map((t) => t.id);
    if (stale.length > 0) {
      await tx.notificationTemplate.updateMany({ where: { id: { in: stale } }, data: { active: false } });
    }
    await writeAudit(
      {
        appUserId: BigInt(actor.id),
        action: "notifications.whatsapp.sync",
        entity: "notification_template",
        after: { fetched: result.templates.length, approved: seenActive.size, deactivated: stale.length },
      },
      tx,
    );
  });

  revalidatePath("/notifications/whatsapp");
  return { success: true };
}

/**
 * Retry one failed/skipped/pending outbox row from its stored payload (the same
 * engine as the digest flush). The row's status/error update in place, so the
 * log immediately shows the new outcome — including the provider's error text
 * if it fails again.
 */
export async function retryNotificationAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("notifications.manage");

  let id: bigint;
  try {
    id = BigInt(String(formData.get("id") ?? ""));
  } catch {
    return;
  }
  const row = await prisma.notificationLog.findUnique({ where: { id } });
  if (!row || row.status === "sent") return; // nothing to retry

  const outcome = await resendLogRow(row);
  await writeAudit({
    appUserId: BigInt(actor.id),
    action: "notifications.retry",
    entity: "notification_log",
    entityId: id,
    before: { status: row.status },
    after: { status: outcome.status },
  });

  revalidatePath(channelPath(row.channel));
}
