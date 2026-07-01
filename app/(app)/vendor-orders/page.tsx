import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { landingFor } from "@/lib/landing";
import { vendorForActor } from "@/lib/vendor";
import { inr } from "@/lib/format";
import { PANEL, TH, TD, LINK_ACT_GOLD } from "@/components/ui/controls";
import { FOOD_REQUEST_STATUS_META, VENDOR_ACTIONABLE, VENDOR_IN_PROGRESS } from "@/services/food-request";
import type { FoodRequestStatus } from "@prisma/client";

function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`${PANEL} flex flex-col gap-1 p-[16px_18px]`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-2">{label}</span>
      <span className={`font-display text-[28px] font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

function OrderTable({
  rows,
  empty,
}: {
  rows: { id: string; code: string; items: number; vendorAmount: string; requestedFor: string; status: FoodRequestStatus; location: string }[];
  empty: string;
}) {
  return (
    <div className={PANEL}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left">
              <th className={TH}>Ref</th>
              <th className={`${TH} text-right`}>Items</th>
              <th className={`${TH} text-right`}>Payable</th>
              <th className={TH}>Delivery</th>
              <th className={TH}>Location</th>
              <th className={TH}>Status</th>
              <th className={`${TH} text-right`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">{empty}</td></tr>
            ) : (
              rows.map((r) => {
                const meta = FOOD_REQUEST_STATUS_META[r.status];
                return (
                  <tr key={r.id} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                    <td className={`${TD} whitespace-nowrap`}>
                      <Link href={`/vendor-orders/${r.id}`} className="font-mono text-[12.5px] font-medium text-ink transition-colors hover:text-gold-deep">{r.code}</Link>
                    </td>
                    <td className={`${TD} text-right font-mono text-ink-2`}>{r.items}</td>
                    <td className={`${TD} text-right font-mono font-semibold text-ink`}>{r.vendorAmount}</td>
                    <td className={`${TD} whitespace-nowrap text-ink-2`}>{r.requestedFor}</td>
                    <td className={`${TD} text-ink-2`}>{r.location}</td>
                    <td className={TD}>
                      <span className={`inline-flex items-center gap-2 text-[12.5px] font-medium ${meta.text}`}>
                        <span className={`size-[7px] rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </td>
                    <td className={`${TD} text-right`}>
                      <Link href={`/vendor-orders/${r.id}`} className={LINK_ACT_GOLD}>Open</Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function VendorOrdersPage() {
  const actor = await requireActor();
  if (!can(actor, "foodRequests.vendor")) redirect(landingFor(actor));

  const vendor = await vendorForActor(actor.id);
  if (!vendor) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-10 sm:px-7">
        <h1 className="font-display text-2xl font-semibold text-ink">Vendor orders</h1>
        <p className="text-sm text-ink-2">No active vendor is linked to your account. Ask an administrator to link your login to a vendor.</p>
      </div>
    );
  }

  const today = startOfToday();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const [actionable, inProgress, recent, todaysCount, upcomingCount] = await Promise.all([
    prisma.foodRequest.findMany({
      where: { vendorId: vendor.id, status: { in: [...VENDOR_ACTIONABLE] } },
      include: { _count: { select: { items: true } } },
      orderBy: { requestedFor: "asc" },
    }),
    prisma.foodRequest.findMany({
      where: { vendorId: vendor.id, status: { in: [...VENDOR_IN_PROGRESS] } },
      include: { _count: { select: { items: true } } },
      orderBy: { requestedFor: "asc" },
    }),
    prisma.foodRequest.findMany({
      where: { vendorId: vendor.id, status: { in: ["delivered", "rejected"] } },
      include: { _count: { select: { items: true } } },
      orderBy: { id: "desc" },
      take: 10,
    }),
    prisma.foodRequest.count({
      where: { vendorId: vendor.id, requestedFor: { gte: today, lt: tomorrow }, status: { notIn: ["cancelled", "rejected"] } },
    }),
    prisma.foodRequest.count({
      where: { vendorId: vendor.id, requestedFor: { gte: tomorrow }, status: { notIn: ["cancelled", "rejected", "delivered"] } },
    }),
  ]);

  const toRow = (r: (typeof actionable)[number]) => ({
    id: r.id.toString(),
    code: r.code,
    items: r._count.items,
    vendorAmount: inr(r.vendorAmount),
    requestedFor: r.requestedFor.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    status: r.status,
    location: r.deliveryLocation,
  });

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-5 py-6 sm:px-7">
      <div>
        <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Vendor orders</h1>
        <p className="mt-1 text-[13px] text-muted">{vendor.name} — incoming food requests and delivery status.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Needs response" value={actionable.length} tone="text-gold-deep" />
        <SummaryCard label="In progress" value={inProgress.length} tone="text-ink" />
        <SummaryCard label="Today" value={todaysCount} tone="text-sage-deep" />
        <SummaryCard label="Upcoming" value={upcomingCount} tone="text-ink" />
      </div>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted-2">Needs your response</h2>
        <OrderTable rows={actionable.map(toRow)} empty="Nothing waiting on you." />
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted-2">In progress</h2>
        <OrderTable rows={inProgress.map(toRow)} empty="No orders in progress." />
      </section>

      {recent.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted-2">Recent</h2>
          <OrderTable rows={recent.map(toRow)} empty="Nothing yet." />
        </section>
      ) : null}
    </div>
  );
}
