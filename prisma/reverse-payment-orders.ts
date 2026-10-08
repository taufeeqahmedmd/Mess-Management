/**
 * Undo an online top-up that was credited by mistake (e.g. `jodo:credit` run on
 * an order the Jodo dashboard later shows as unpaid). The in-app "reverse"
 * button deliberately refuses online recharges, so this is the only path.
 *
 * Ledger discipline: nothing is deleted. The recharge's UNSPENT coupons are
 * clawed back with offsetting DR `coupon_transactions` rows (the same
 * `reverseRechargeRemaining` the edit/delete flow uses), the recharge becomes
 * `reversed`, the order becomes `failed` (so reconcile never re-polls it and
 * the recharge link stays for traceability), and an audit row records who did
 * it and why. Coupons the cardholder already spent cannot be clawed back — the
 * dry run shows that split so you decide with eyes open.
 *
 * Default is a dry run. Nothing is written until --confirm is passed.
 *
 * Usage (on the server):
 *   npx tsx prisma/reverse-payment-orders.ts --ids 2819,2822 --by "Taufeeq" --reason "not paid at Jodo"
 *   npx tsx prisma/reverse-payment-orders.ts --ids 2819,2822 --by "Taufeeq" --reason "not paid at Jodo" --confirm
 */
import { PrismaClient } from "@prisma/client";
import { writeAudit } from "../lib/audit";
import { reverseRechargeRemaining } from "../services/recharge-ledger";

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
  if (!by) throw new Error('--by "<operator name>" is required (recorded on the audit row)');
  if (!reason) throw new Error('--reason "<why>" is required (recorded on the audit row)');
  const ids = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0 || ids.some((s) => !/^\d+$/.test(s))) throw new Error("--ids must be a comma-separated list of payment_orders ids");

  const orders = await prisma.paymentOrder.findMany({
    where: { id: { in: ids.map((s) => BigInt(s)) } },
    orderBy: { id: "asc" },
    include: { recharge: { include: { coupons: true } } },
  });
  const found = new Set(orders.map((o) => o.id.toString()));
  for (const id of ids) if (!found.has(id)) console.log(`#${id}  not found — skipped`);

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(orders.map((o) => o.userId))] } },
    select: { id: true, code: true, fullName: true },
  });
  const userById = new Map(users.map((u) => [u.id.toString(), u]));

  console.log(`${confirm ? "REVERSING" : "DRY RUN"} — ${orders.length} order(s), by ${by}: ${reason}\n`);
  let reversed = 0;
  let skipped = 0;
  for (const o of orders) {
    const u = userById.get(o.userId.toString());
    const who = u ? `${u.code}  ${u.fullName}` : `user#${o.userId}`;
    const head = `#${o.id}  ${who}  ₹${o.amount.toFixed(2)}  ${o.status}`;

    if (o.status !== "credited" || !o.recharge) {
      console.log(`${head}  → skipped (not a credited order)`);
      skipped++;
      continue;
    }
    if (o.recharge.status !== "posted") {
      console.log(`${head}  → skipped (recharge #${o.recharge.id} is already ${o.recharge.status})`);
      skipped++;
      continue;
    }
    const granted = o.recharge.coupons.reduce((s, c) => s + c.count, 0);
    const unspent = o.recharge.coupons.reduce((s, c) => s + c.remaining, 0);
    const spent = granted - unspent;
    const split = `recharge #${o.recharge.id}: ${granted} coupon(s) granted, ${unspent} unspent → clawed back, ${spent} already spent → NOT recoverable`;

    if (!confirm) {
      console.log(`${head}  → would reverse  (${split})`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const ok = await reverseRechargeRemaining(tx, o.recharge!.id, "reversal", null);
      if (!ok) throw new Error(`recharge #${o.recharge!.id} could not be reversed`);
      await tx.paymentOrder.update({ where: { id: o.id }, data: { status: "failed", nextCheckAt: null } });
      await writeAudit(
        {
          appUserId: null,
          action: "recharge.reverse",
          entity: "recharge",
          entityId: o.recharge!.id,
          before: { status: "posted", orderStatus: "credited" },
          after: {
            status: "reversed",
            orderStatus: "failed",
            paymentOrderId: o.id.toString(),
            userId: o.userId.toString(),
            couponsClawedBack: unspent,
            couponsAlreadySpent: spent,
            manual: true,
            reversedBy: by,
            reason,
          },
        },
        tx,
      );
    });
    console.log(`${head}  → reversed  (${split})`);
    reversed++;
  }

  console.log("");
  if (confirm) console.log(`Done: ${reversed} reversed, ${skipped} skipped.`);
  else console.log("Dry run only. Re-run with --confirm to reverse.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
