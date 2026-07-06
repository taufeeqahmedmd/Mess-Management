import nodemailer, { type Transporter } from "nodemailer";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { whatsappConfigured, partnerConfigured, partnerSendConfigured, sendPartnerTemplate } from "./smartping";

export { whatsappConfigured, partnerConfigured };

/**
 * Channel senders (phase 2 — live transports). Each sender validates its
 * environment configuration and reports `skipped` (with the reason) when the
 * credentials aren't provisioned, so the module degrades gracefully per channel:
 *   - email:    nodemailer SMTP, one account per entity under SMTP_<PREFIX>_* (Pallavi/DPS)
 *   - whatsapp: Smartping — Partner API direct template send (preferred), else the
 *               campaign API by campaign name (fallback)
 *   - push:     Web Push (VAPID) to the staff login's PWA subscriptions
 * Every outcome lands in notification_logs via the dispatcher.
 */

export type SendOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

const env = (k: string) => (process.env[k] ?? "").trim();

// ------------------------------------------------------------------ email

/** SMTP config presence for an email entity (env prefix, e.g. PALLAVI / DPS). */
export function smtpConfigured(envPrefix: string): boolean {
  return Boolean(env(`SMTP_${envPrefix}_HOST`) && env(`SMTP_${envPrefix}_USER`) && env(`SMTP_${envPrefix}_PASS`));
}

// One pooled transport per entity, reused across sends (module-scope cache).
const transports = new Map<string, Transporter>();

function transportFor(envPrefix: string): Transporter {
  let t = transports.get(envPrefix);
  if (!t) {
    const port = Number.parseInt(env(`SMTP_${envPrefix}_PORT`) || "587", 10);
    t = nodemailer.createTransport({
      host: env(`SMTP_${envPrefix}_HOST`),
      port,
      secure: port === 465,
      auth: { user: env(`SMTP_${envPrefix}_USER`), pass: env(`SMTP_${envPrefix}_PASS`) },
      pool: true,
      maxConnections: 2,
    });
    transports.set(envPrefix, t);
  }
  return t;
}

export async function sendEmail(p: {
  envPrefix: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  body: string;
}): Promise<SendOutcome> {
  if (!smtpConfigured(p.envPrefix)) {
    return { status: "skipped", reason: `SMTP not configured (SMTP_${p.envPrefix}_*)` };
  }
  try {
    await transportFor(p.envPrefix).sendMail({
      from: `"${p.fromName.replace(/"/g, "'")}" <${p.fromEmail}>`,
      to: p.to,
      subject: p.subject,
      text: p.body,
    });
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

// ------------------------------------------------------------------ whatsapp

/** Indian mobile → country-coded MSISDN AiSensy expects (91XXXXXXXXXX). */
function msisdn(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

/**
 * Send an approved WhatsApp template via Smartping. Preferred path: the PARTNER
 * API's direct template send (template name + language + positional body params —
 * exactly what the synced Templates tab lists). Fallback: the campaign API
 * (apiKey in the JSON body, send by campaign name whose status is Live — only
 * works if a campaign exists with the same name as the template).
 * `params` are the template's {{1}},{{2}},… values in order (event waParams).
 */
export async function sendWhatsApp(p: {
  phone: string;
  templateName: string | null;
  language: string | null;
  userName: string;
  params: string[];
}): Promise<SendOutcome> {
  if (!p.templateName) return { status: "skipped", reason: "No WhatsApp template mapped to this event" };

  // Preferred: Partner API direct send by template name.
  if (partnerSendConfigured()) {
    const r = await sendPartnerTemplate({
      to: msisdn(p.phone),
      templateName: p.templateName,
      language: p.language || "en",
      params: p.params,
    });
    return r.ok ? { status: "sent" } : { status: "failed", error: r.error };
  }

  // Fallback: campaign API (send by campaign name = template name).
  if (!whatsappConfigured()) {
    return {
      status: "skipped",
      reason: "WhatsApp not configured (PINBOT_API_KEY / PINBOT_WABA_ID or SMARTPING_API_KEY / SMARTPING_BASE_URL)",
    };
  }
  try {
    const base = env("SMARTPING_BASE_URL").replace(/\/$/, "");
    const res = await fetch(`${base}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: env("SMARTPING_API_KEY"),
        campaignName: p.templateName,
        destination: msisdn(p.phone),
        userName: p.userName || "Customer",
        source: "mess-management",
        templateParams: p.params,
      }),
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      return { status: "failed", error: `Smartping campaign ${res.status}: ${text}` };
    }
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

// ------------------------------------------------------------------ push

export function pushConfigured(): boolean {
  return Boolean(env("VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY"));
}

let vapidReady = false;
function ensureVapid(): void {
  if (vapidReady) return;
  webpush.setVapidDetails(
    env("VAPID_SUBJECT") || "mailto:info@k-innovative.com",
    env("VAPID_PUBLIC_KEY"),
    env("VAPID_PRIVATE_KEY"),
  );
  vapidReady = true;
}

export async function sendPush(p: { appUserId: bigint; title: string; body: string; url?: string }): Promise<SendOutcome> {
  if (!pushConfigured()) {
    return { status: "skipped", reason: "Web Push not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)" };
  }
  ensureVapid();

  const subs = await prisma.pushSubscription.findMany({ where: { appUserId: p.appUserId } });
  if (subs.length === 0) {
    return { status: "skipped", reason: "No push subscription (the login hasn't enabled notifications)" };
  }

  const payload = JSON.stringify({ title: p.title, body: p.body, url: p.url ?? "/" });
  let delivered = 0;
  let lastError = "";
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      delivered++;
    } catch (e) {
      const statusCode = (e as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Subscription is gone (browser unregistered) — clean it up.
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
  }
  if (delivered > 0) return { status: "sent" };
  return lastError
    ? { status: "failed", error: lastError }
    : { status: "skipped", reason: "All push subscriptions were stale (removed)" };
}
