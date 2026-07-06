"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type NotificationChannel, type NotificationFrequency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { notificationEvent } from "@/services/notification-events";
import { parseRecipients } from "@/services/notifications";

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

/** Create or update a channel template (WhatsApp rows carry the Business template id + variable order). */
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
  const waVariablesRaw = String(formData.get("waVariables") ?? "").trim();
  const active = formData.get("active") !== "off";

  if (!name) return { error: "Template name is required." };
  if (!body) return { error: "Template body is required." };
  if (channel !== "whatsapp" && !title) {
    return { error: channel === "email" ? "Email subject is required." : "Push title is required." };
  }
  if (channel === "whatsapp" && !waTemplateId) {
    return { error: "WhatsApp Template ID is required (the approved Business template)." };
  }

  const waVariables = waVariablesRaw
    ? waVariablesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const data = {
    channel,
    name,
    title: channel === "whatsapp" ? null : title,
    body,
    waTemplateId: channel === "whatsapp" ? waTemplateId : null,
    waVariables: channel === "whatsapp" ? (waVariables as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
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
