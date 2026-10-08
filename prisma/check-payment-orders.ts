/**
 * READ-ONLY: ask Jodo for the current state of specific online top-up orders and
 * print it next to ours. Use it before `jodo:credit` (which trusts the operator)
 * so a pending order is only credited when the gateway — or the dashboard —
 * says it was paid. Writes nothing.
 *
 * Usage (on the server):
 *   npx tsx prisma/check-payment-orders.ts --ids 2884,2878          # specific orders
 *   npx tsx prisma/check-payment-orders.ts --branch GP --pending    # every pending order of a branch
 *
 * Calls are paced (Jodo rate-limits get-order with 429s); a 429 means "ask
 * again later", not "unpaid".
 */
import { PrismaClient } from "@prisma/client";
import { getJodoOrder, pause, resolveJodoConfig } from "../lib/jodo";

const prisma = new PrismaClient();
const GAP_MS = 700;

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const idsRaw = arg("ids");
  const branchArg = arg("branch");
  if (!idsRaw && !(branchArg && flag("pending"))) {
    throw new Error("Pass --ids 1,2,3 or --branch <id|code> --pending");
  }

  let where: Record<string, unknown>;
  if (idsRaw) {
    const ids = idsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.some((s) => !/^\d+$/.test(s))) throw new Error("--ids must be a comma-separated list of payment_orders ids");
    where = { id: { in: ids.map((s) => BigInt(s)) } };
  } else {
    const branch = await prisma.branch.findFirst({
      where: /^\d+$/.test(branchArg!) ? { id: BigInt(branchArg!) } : { code: branchArg! },
    });
    if (!branch) throw new Error(`Branch not found: ${branchArg}`);
    where = { branchId: branch.id, status: "pending" };
  }

  const orders = await prisma.paymentOrder.findMany({ where, orderBy: { id: "asc" } });
  if (orders.length === 0) {
    console.log("No matching orders.");
    return;
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(orders.map((o) => o.userId))] } },
    select: { id: true, code: true, fullName: true },
  });
  const userById = new Map(users.map((u) => [u.id.toString(), u]));
  const whoIs = (userId: bigint) => {
    const u = userById.get(userId.toString());
    return u ? `${u.code}  ${u.fullName}` : `user#${userId}`;
  };

  console.log(`${orders.length} order(s)\n`);
  console.log("id     ours       jodo       jodo_amount  ours_amount  transaction_id            user");
  const summary = { paid: [] as string[], unpaid: [] as string[], unknown: [] as string[] };
  let calls = 0;
  for (const o of orders) {
    const cfg = await resolveJodoConfig(o.branchId);
    if (!cfg) {
      console.log(`#${o.id}  ${o.status.padEnd(9)}  (branch has no payment config)`);
      summary.unknown.push(o.id.toString());
      continue;
    }
    if (calls++ > 0) await pause(GAP_MS);
    const res = await getJodoOrder(cfg, o.jodoOrderId);
    const who = whoIs(o.userId);
    if (!res.ok) {
      console.log(`#${o.id}  ${o.status.padEnd(9)}  ERROR ${res.status ?? ""} ${res.error}  ${who}`);
      summary.unknown.push(o.id.toString());
      continue;
    }
    const jodoStatus = (res.orderStatus ?? "?").padEnd(9);
    const jodoAmt = (res.amount == null ? "-" : res.amount.toFixed(2)).padStart(11);
    const oursAmt = o.amount.toFixed(2).padStart(11);
    const mismatch = res.amount != null && Math.abs(res.amount - Number(o.amount)) > 0.005 ? "  AMOUNT MISMATCH" : "";
    console.log(`#${o.id}  ${o.status.padEnd(9)}  ${jodoStatus}  ${jodoAmt}  ${oursAmt}  ${(res.transactionId ?? "-").padEnd(24)}  ${who}${mismatch}`);
    (res.paid ? summary.paid : summary.unpaid).push(o.id.toString());
  }

  console.log("");
  console.log(`paid at Jodo:     ${summary.paid.join(",") || "-"}`);
  console.log(`not paid at Jodo: ${summary.unpaid.join(",") || "-"}`);
  if (summary.unknown.length) console.log(`could not check:  ${summary.unknown.join(",")}  (retry later or verify in the Jodo dashboard)`);
  const wrong = orders.filter((o) => o.status === "credited" && summary.unpaid.includes(o.id.toString()));
  if (wrong.length) {
    console.log(`\nWARNING — credited by us but NOT paid at Jodo: ${wrong.map((o) => `#${o.id}`).join(", ")}. Reverse those recharges.`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
