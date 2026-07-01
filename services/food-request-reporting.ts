/**
 * Food-request reporting (plan.md §15.4 F). Status counts + cost breakdowns for
 * the admin/finance "Food requests" report. Cost is realised from DELIVERED
 * requests (their snapshot `amount` = charged to the RFID account, `vendorAmount`
 * = payable to the vendor). The report date axis is the request's `createdAt`
 * (when it was raised). Branch-scoped by the request's branch.
 *
 * NOTE: the vendor *settlement* number still comes from the redemption ledger
 * (services/settlement.ts) — food-request redemptions are already included there.
 * These aggregates are a request-centric cut for finance, not a second payout.
 */

import { Prisma, type FoodRequestStatus } from "@prisma/client";

type Db = Prisma.TransactionClient | import("@prisma/client").PrismaClient;

const ZERO = new Prisma.Decimal(0);

const OPEN_STATUSES: FoodRequestStatus[] = [
  "raised", "pending_approval", "approved", "vendor_accepted", "preparing", "out_for_delivery",
];

export type FrBreakdown = { id: string; label: string; count: number; charged: Prisma.Decimal; vendor: Prisma.Decimal };

export type FoodRequestReportData = {
  total: number;
  pending: number; // still in flight
  delivered: number;
  closed: number; // rejected + cancelled
  charged: Prisma.Decimal; // Σ amount over delivered
  vendorCost: Prisma.Decimal; // Σ vendorAmount over delivered
  byDepartment: FrBreakdown[];
  byRequestor: FrBreakdown[];
  byVendor: FrBreakdown[];
};

type Filter = { branchId: bigint | null; from: Date; toExclusive: Date };

export async function foodRequestReport(db: Db, f: Filter): Promise<FoodRequestReportData> {
  const baseWhere: Prisma.FoodRequestWhereInput = {
    createdAt: { gte: f.from, lt: f.toExclusive },
    ...(f.branchId ? { branchId: f.branchId } : {}),
  };

  const groups = await db.foodRequest.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } });
  let total = 0, pending = 0, delivered = 0, closed = 0;
  for (const g of groups) {
    total += g._count._all;
    if (g.status === "delivered") delivered += g._count._all;
    else if (g.status === "rejected" || g.status === "cancelled") closed += g._count._all;
    else if (OPEN_STATUSES.includes(g.status)) pending += g._count._all;
  }

  const dels = await db.foodRequest.findMany({
    where: { ...baseWhere, status: "delivered" },
    select: {
      amount: true,
      vendorAmount: true,
      vendorId: true,
      requestedByAppUserId: true,
      user: { select: { departmentId: true } },
    },
  });

  type Acc = { count: number; charged: Prisma.Decimal; vendor: Prisma.Decimal };
  const fresh = (): Acc => ({ count: 0, charged: ZERO, vendor: ZERO });
  const byDept = new Map<string, Acc>();
  const byReq = new Map<string, Acc>();
  const byVen = new Map<string, Acc>();
  let charged = ZERO, vendorCost = ZERO;

  const add = (m: Map<string, Acc>, key: string, r: { amount: Prisma.Decimal; vendorAmount: Prisma.Decimal }) => {
    const a = m.get(key) ?? fresh();
    a.count += 1;
    a.charged = a.charged.plus(r.amount);
    a.vendor = a.vendor.plus(r.vendorAmount);
    m.set(key, a);
  };

  for (const r of dels) {
    charged = charged.plus(r.amount);
    vendorCost = vendorCost.plus(r.vendorAmount);
    add(byDept, r.user.departmentId?.toString() ?? "none", r);
    add(byReq, r.requestedByAppUserId.toString(), r);
    add(byVen, r.vendorId?.toString() ?? "none", r);
  }

  // Resolve labels.
  const deptIds = [...byDept.keys()].filter((k) => k !== "none").map(BigInt);
  const reqIds = [...byReq.keys()].map(BigInt);
  const venIds = [...byVen.keys()].filter((k) => k !== "none").map(BigInt);
  const [depts, reqs, vens] = await Promise.all([
    deptIds.length ? db.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    reqIds.length ? db.appUser.findMany({ where: { id: { in: reqIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    venIds.length ? db.vendor.findMany({ where: { id: { in: venIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const deptName = new Map(depts.map((d) => [d.id.toString(), d.name]));
  const reqName = new Map(reqs.map((u) => [u.id.toString(), u.name]));
  const venName = new Map(vens.map((v) => [v.id.toString(), v.name]));

  const toList = (m: Map<string, Acc>, labelOf: (k: string) => string): FrBreakdown[] =>
    [...m.entries()]
      .map(([id, a]) => ({ id, label: labelOf(id), count: a.count, charged: a.charged, vendor: a.vendor }))
      .sort((x, y) => y.charged.comparedTo(x.charged));

  return {
    total,
    pending,
    delivered,
    closed,
    charged,
    vendorCost,
    byDepartment: toList(byDept, (k) => (k === "none" ? "— No department" : deptName.get(k) ?? "—")),
    byRequestor: toList(byReq, (k) => reqName.get(k) ?? "—"),
    byVendor: toList(byVen, (k) => (k === "none" ? "— Unassigned" : venName.get(k) ?? "—")),
  };
}
