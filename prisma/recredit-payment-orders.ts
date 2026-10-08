/**
 * Re-credit an online top-up whose recharge was REVERSED BY MISTAKE
 * (`jodo:reverse` run on an order that turns out to have been paid).
 *
 * The order's `client_uuid` is already held by the reversed recharge, so the
 * normal credit path (webhook / reconcile / jodo:credit) can never grant it
 * again — it would hit the unique key and report "already credited". This
 * goes through the same `creditPaymentOrder` with its `recredit` option: a
 * fresh idempotency key, the amount recomputed from the catalog, the order
 * back to `credited` and linked to the new recharge, and an audit row naming
 * who did it and why. The reversed recharge and its ledger rows stay as they
 * are — nothing is deleted or rewritten.
 *
 * Only a `failed` order (what `jodo:reverse` leaves behind) is accepted.
 * Default is a dry run. Nothing is written until --confirm is passed.
 *
 * Usage (on the server):
 *   npx tsx prisma/recredit-payment-orders.ts --ids 2822 --by "Taufeeq" --reason "settled webhook on Oct 7 proves payment"
 *   npx tsx prisma/recredit-payment-orders.ts --ids 2822 --by "Taufeeq" --reason "settled webhook on Oct 7 proves payment" --confirm
 */
import { PrismaClient } from "@prisma/client";
import { creditPaymentOrder } from "../lib/run-online-topup";

const prisma = new PrismaClient();

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const by = (arg("by") ?? "").trim();
  const reason = (arg("reason") ?? "").trim();
  const idsRaw = arg("ids") ?? "";
  const confirm = process.argv.includes("--confirm");
  if (!by) throw new Error('--by "<operator name>" is required (recorded on the recharge + audit row)');
  if (!reason) throw new Error('--reason "<why>" is required (recorded on the recharge + audit row)');
  const ids = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0 || ids.some((s) => !/^\d+$/.test(s))) throw new Error("--ids must be a comma-separated list of payment_orders ids");

  const orders = await prisma.paymentOrder.findMany({
    where: { id: { in: ids.map((s) => BigInt(s)) } },
    orderBy: { id: "asc" },
    include: { recharge: { select: { id: true, status: true } } },
  });
  const found = new Set(orders.map((o) => o.id.toString()));
  for (const id of ids) if (!found.has(id)) console.log(`#${id}  not found — skipped`);

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(orders.map((o) => o.userId))] } },
    select: { id: true, code: true, fullName: true },
  });
  const userById = new Map(users.map((u) => [u.id.toString(), u]));

  console.log(`${confirm ? "RE-CREDITING" : "DRY RUN"} — ${orders.length} order(s), by ${by}: ${reason}\n`);
  let credited = 0;
  let skipped = 0;
  for (const o of orders) {
    const u = userById.get(o.userId.toString());
    const who = u ? `${u.code}  ${u.fullName}` : `user#${o.userId}`;
    const prev = o.recharge ? `previous recharge #${o.recharge.id} (${o.recharge.status})` : "no previous recharge";
    const head = `#${o.id}  ${who}  ₹${o.amount.toFixed(2)}  ${o.status}  ${prev}`;

    if (o.status !== "failed" || o.recharge?.status !== "reversed") {
      console.log(`${head}  → skipped (only a failed order whose recharge is reversed can be re-credited)`);
      skipped++;
      continue;
    }
    if (!confirm) {
      console.log(`${head}  → would re-credit`);
      continue;
    }
    const r = await creditPaymentOrder(o, null, { recredit: { by, reason } });
    if (!r.ok) {
      console.log(`${head}  → FAILED: ${r.error}`);
      skipped++;
      continue;
    }
    console.log(`${head}  → ${r.already ? "already credited" : "re-credited"}`);
    credited++;
  }

  console.log("");
  if (confirm) console.log(`Done: ${credited} re-credited, ${skipped} skipped.`);
  else console.log("Dry run only. Re-run with --confirm to re-credit.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
