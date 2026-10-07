/**
 * Register (or rotate) a branch's Jodo webhook subscriptions and store the
 * signing secret in `payment_config` — the one operational step that turns on
 * webhook-driven crediting for that branch.
 *
 * What it does, in order (so a half-run never leaves a dangling state):
 *   1. generate a fresh 32-byte secret;
 *   2. add two subscriptions on the branch's Jodo account (order.payment.debited,
 *      order.payment.settled) pointing at <APP_URL>/api/public/pay/webhook;
 *   3. store the secret + subscription ids on payment_config (only after Jodo
 *      accepted both — if step 2 fails midway, the partial subscription is
 *      disabled again and nothing is stored);
 *   4. disable the branch's previous subscriptions, if any (Jodo has no
 *      "update" API — rotation is add-new-then-disable-old).
 *
 * Usage (on the server, with the production DATABASE_URL + APP_URL in .env):
 *   npx tsx prisma/register-jodo-webhook.ts --branch <id|code> --email ops@example.com
 *   npx tsx prisma/register-jodo-webhook.ts --branch <id|code> --list       # show Jodo's view
 *   npx tsx prisma/register-jodo-webhook.ts --branch <id|code> --disable-all # turn webhooks off
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { addJodoWebhook, disableJodoWebhook, listJodoWebhooks, resolveJodoConfig, JODO_EVENT_DEBITED, JODO_EVENT_SETTLED } from "../lib/jodo";

const prisma = new PrismaClient();

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

type StoredIds = { id: string; eventCode: string }[];

async function main() {
  const branchArg = arg("branch");
  if (!branchArg) throw new Error("--branch <id|code> is required");
  const branch = await prisma.branch.findFirst({
    where: /^\d+$/.test(branchArg) ? { id: BigInt(branchArg) } : { code: branchArg },
    include: { paymentConfig: true },
  });
  if (!branch) throw new Error(`Branch not found: ${branchArg}`);
  const cfg = await resolveJodoConfig(branch.id);
  if (!cfg) throw new Error(`Branch ${branch.code} has no complete payment_config (collector code + url + credentials).`);
  const stored = (branch.paymentConfig?.webhookIds as StoredIds | null) ?? [];

  if (flag("list")) {
    const res = await listJodoWebhooks(cfg);
    if (!res.ok) throw new Error(res.error);
    console.log(`Jodo subscriptions for ${branch.code}:`);
    for (const w of res.webhooks) console.log(`  ${w.id}  ${w.eventCode}  ${w.url}${stored.some((s) => s.id === w.id) ? "  (stored)" : ""}`);
    console.log(`Stored secret: ${branch.paymentConfig?.webhookSecret ? "yes" : "no"}`);
    return;
  }

  if (flag("disable-all")) {
    for (const s of stored) {
      const r = await disableJodoWebhook(cfg, s.id);
      console.log(`disable ${s.id} (${s.eventCode}): ${r.ok ? "ok" : r.error}`);
    }
    await prisma.paymentConfig.update({ where: { branchId: branch.id }, data: { webhookIds: [], webhookSecret: null } });
    console.log("Webhook secret cleared; branch is back to polling-only.");
    return;
  }

  const email = arg("email");
  if (!email) throw new Error("--email <failure notification email> is required (Jodo emails it when deliveries fail)");
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (!/^https:\/\//.test(appUrl)) throw new Error("APP_URL must be set to the public https URL of this app");
  const url = `${appUrl}/api/public/pay/webhook`;

  const secret = randomBytes(32).toString("hex");
  const added: StoredIds = [];
  for (const eventCode of [JODO_EVENT_DEBITED, JODO_EVENT_SETTLED]) {
    const r = await addJodoWebhook(cfg, { eventCode, url, secretKey: secret, failureEmail: email });
    if (!r.ok) {
      // Roll back the one we already added so Jodo isn't left with a half pair.
      for (const a of added) await disableJodoWebhook(cfg, a.id);
      throw new Error(`Jodo rejected ${eventCode}: ${r.error}`);
    }
    added.push({ id: r.webhook.id, eventCode: r.webhook.eventCode });
    console.log(`added ${r.webhook.id}  ${eventCode}  → ${url}`);
  }

  await prisma.paymentConfig.update({
    where: { branchId: branch.id },
    data: { webhookSecret: secret, webhookIds: added },
  });
  console.log(`Stored webhook secret + ids for branch ${branch.code}.`);

  for (const s of stored) {
    const r = await disableJodoWebhook(cfg, s.id);
    console.log(`disabled previous ${s.id} (${s.eventCode}): ${r.ok ? "ok" : r.error}`);
  }
  console.log("Done. Make one small test payment and confirm a row appears in payment_webhook_events.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
