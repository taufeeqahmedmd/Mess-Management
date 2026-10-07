/**
 * Credit specific online top-up orders that an operator has VERIFIED AS PAID in
 * the Jodo dashboard, when the gateway itself won't answer (e.g. get-order
 * returning 429 for those orders). Goes through the same idempotent
 * `creditPaymentOrder` as the webhook and reconcile, so:
 *   - the coupons are granted exactly once (order status + client_uuid guard);
 *   - the order becomes `credited`, so reconcile/webhook can never credit it again
 *     (which a manual recharge through the UI would NOT prevent — double credit);
 *   - the recharge remark + audit row say who verified it.
 *
 * Default is a dry run that lists what would be credited. Nothing is written
 * until --confirm is passed. Verify EVERY id in the Jodo dashboard first — this
 * script trusts the operator, not the gateway.
 *
 * Usage (on the server):
 *   npx tsx prisma/credit-payment-orders.ts --ids 2884,2878 --by "Taufeeq"            # dry run
 *   npx tsx prisma/credit-payment-orders.ts --ids 2884,2878 --by "Taufeeq" --confirm  # credit
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
  const idsRaw = arg("ids") ?? "";
  const confirm = process.argv.includes("--confirm");
  if (!by) throw new Error('--by "<operator name>" is required (recorded on the recharge + audit row)');
  const ids = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0 || ids.some((s) => !/^\d+$/.test(s))) throw new Error("--ids must be a comma-separated list of payment_orders ids");

  const orders = await prisma.paymentOrder.findMany({
    where: { id: { in: ids.map((s) => BigInt(s)) } },
    orderBy: { id: "asc" },
  });
  const missing = ids.filter((s) => !orders.some((o) => o.id.toString() === s));
  if (missing.length) throw new Error(`Unknown payment order id(s): ${missing.join(", ")}`);

  const users = await prisma.user.findMany({
    where: { id: { in: orders.map((o) => o.userId) } },
    select: { id: true, code: true, fullName: true },
  });
  const user = (id: bigint) => users.find((u) => u.id === id);

  console.log(`${confirm ? "CREDITING" : "DRY RUN"} — ${orders.length} order(s), verified by ${by}\n`);
  let credited = 0;
  let already = 0;
  let skipped = 0;
  for (const o of orders) {
    const u = user(o.userId);
    const line = `#${o.id}  ${u?.code ?? "?"}  ${u?.fullName ?? "?"}  ₹${o.amount.toFixed(2)}  ${o.status}  created ${o.createdAt.toISOString()}`;
    if (o.status === "credited") {
      console.log(`${line}  → already credited, skipped`);
      already++;
      continue;
    }
    if (o.status !== "pending") {
      console.log(`${line}  → status is ${o.status}, skipped (set it back to pending first if it really was paid)`);
      skipped++;
      continue;
    }
    if (!confirm) {
      console.log(`${line}  → would credit`);
      continue;
    }
    const r = await creditPaymentOrder(o, null, { manual: { by } });
    if (!r.ok) {
      console.log(`${line}  → FAILED: ${r.error}`);
      skipped++;
    } else if (r.already) {
      console.log(`${line}  → already credited (raced with reconcile/webhook)`);
      already++;
    } else {
      console.log(`${line}  → credited`);
      credited++;
    }
  }
  console.log(`\n${confirm ? `Done: ${credited} credited, ${already} already, ${skipped} skipped.` : "Dry run only. Re-run with --confirm to credit."}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
