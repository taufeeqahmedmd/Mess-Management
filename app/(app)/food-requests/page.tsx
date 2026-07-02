import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma, type FoodRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Pager } from "@/components/ui/pager";
import { BTN_PRIMARY, PANEL, TH, TD, LINK_ACT_GOLD, LINK_ACT_DANGER, clampPageSize } from "@/components/ui/controls";
import { PlusGlyph } from "@/components/ui/glyphs";
import { FOOD_REQUEST_STATUS_META, isCancellable } from "@/services/food-request";
import { cancelFoodRequestAction } from "./actions";
import { RaiseDrawer } from "./raise-drawer";

const STATUS_ORDER: FoodRequestStatus[] = [
  "raised", "pending_approval", "approved", "vendor_accepted", "preparing", "out_for_delivery", "delivered", "rejected", "cancelled",
];

export default async function FoodRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; size?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "foodRequests.view")) redirect("/dashboard");
  const canCreate = can(actor, "foodRequests.create");
  const canCancel = can(actor, "foodRequests.cancel");

  const sp = await searchParams;
  const status = STATUS_ORDER.includes(sp.status as FoodRequestStatus) ? (sp.status as FoodRequestStatus) : null;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = clampPageSize(sp.size, 25);

  const branchWhere: Prisma.FoodRequestWhereInput = actor.branchId ? { branchId: BigInt(actor.branchId) } : {};

  // Requests list
  const where: Prisma.FoodRequestWhereInput = { ...branchWhere, ...(status ? { status } : {}) };
  const [requests, total, countsRaw] = await Promise.all([
    prisma.foodRequest.findMany({
      where,
      include: { user: true, vendor: true, _count: { select: { items: true } } },
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.foodRequest.count({ where }),
    prisma.foodRequest.groupBy({ by: ["status"], where: branchWhere, _count: { _all: true } }),
  ]);
  const countByStatus = new Map(countsRaw.map((g) => [g.status, g._count._all]));
  const totalAll = countsRaw.reduce((s, g) => s + g._count._all, 0);

  // The logged-in staff's linked cardholder (if any) → the "Raise request" button
  // opens the drawer defaulted to their own account; otherwise it routes to the picker.
  let self: { id: string; name: string; code: string; category: string } | null = null;
  let catalog: { id: string; name: string; kind: string; unitPrice: string; vendorPrice: string }[] = [];
  let vendors: { id: string; name: string }[] = [];
  let locations: string[] = [];
  if (canCreate) {
    const me = await prisma.appUser.findUnique({
      where: { id: BigInt(actor.id) },
      select: { cardholder: { select: { id: true, fullName: true, code: true, status: true, deletedAt: true, branchId: true, category: { select: { name: true } } } } },
    });
    const cc = me?.cardholder;
    if (cc && !cc.deletedAt && cc.status === "active" && (!actor.branchId || cc.branchId.toString() === actor.branchId)) {
      self = { id: cc.id.toString(), name: cc.fullName, code: cc.code, category: cc.category.name };
      const [cat, ven, loc] = await Promise.all([
        prisma.foodItem.findMany({ where: { active: true, OR: [{ branchId: null }, { branchId: cc.branchId }] }, orderBy: { name: "asc" } }),
        prisma.vendor.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
        prisma.deliveryLocation.findMany({ where: { status: "active", OR: [{ branchId: null }, { branchId: cc.branchId }] }, orderBy: { name: "asc" }, select: { name: true } }),
      ]);
      catalog = cat.map((c) => ({ id: c.id.toString(), name: c.name, kind: c.kind, unitPrice: c.unitPrice.toFixed(2), vendorPrice: c.unitVendorPrice.toFixed(2) }));
      vendors = ven.map((v) => ({ id: v.id.toString(), name: v.name }));
      locations = loc.map((l) => l.name);
    }
  }

  const filterHref = (s: FoodRequestStatus | null) => {
    const params = new URLSearchParams();
    if (s) params.set("status", s);
    const qs = params.toString();
    return qs ? `/food-requests?${qs}` : "/food-requests";
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Food Requests</h1>
          <p className="mt-1 text-[13px] text-muted">Raise item requests against a cardholder&rsquo;s RFID account.</p>
        </div>
        {canCreate ? (
          self ? (
            <RaiseDrawer userId={self.id} userName={self.name} userCode={self.code} category={self.category} catalog={catalog} vendors={vendors} locations={locations} />
          ) : (
            <Link href="/food-requests/new" className={BTN_PRIMARY}>
              <PlusGlyph />
              Raise request
            </Link>
          )
        ) : null}
      </div>

      {/* Status filter chips with live counts (empty statuses hidden) */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link
          href={filterHref(null)}
          aria-current={!status ? "page" : undefined}
          className={`-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] transition-colors ${!status ? "border-gold-deep font-semibold text-ink" : "border-transparent font-medium text-muted hover:text-ink"}`}
        >
          All
          <span className={`rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums ${!status ? "bg-ink text-surface" : "bg-surface-2 text-muted-2"}`}>{totalAll}</span>
        </Link>
        {STATUS_ORDER.map((s) => {
          const meta = FOOD_REQUEST_STATUS_META[s];
          const cnt = countByStatus.get(s) ?? 0;
          const active = status === s;
          if (cnt === 0 && !active) return null; // hide empty statuses (mock parity)
          return (
            <Link
              key={s}
              href={filterHref(s)}
              aria-current={active ? "page" : undefined}
              className={`-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-[13px] transition-colors ${active ? "border-gold-deep font-semibold text-ink" : "border-transparent font-medium text-muted hover:text-ink"}`}
            >
              <span className={`size-[7px] rounded-full ${meta.dot} ${active ? "ring-2 ring-gold/20" : ""}`} />
              {meta.label}
              <span className={`rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums ${active ? "bg-gold-soft-2 text-gold-deep" : "bg-surface-2 text-muted-2"}`}>{cnt}</span>
            </Link>
          );
        })}
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Ref</th>
                <th className={TH}>Cardholder</th>
                <th className={`${TH} text-center`}>Items</th>
                <th className={`${TH} text-right`}>Amount</th>
                <th className={TH}>Delivery</th>
                <th className={TH}>Vendor</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-muted">No food requests yet.</td></tr>
              ) : (
                requests.map((r) => {
                  const meta = FOOD_REQUEST_STATUS_META[r.status];
                  return (
                    <tr key={r.id.toString()} className="border-b border-line transition-colors last:border-0 hover:bg-surface-2">
                      <td className={`${TD} whitespace-nowrap`}>
                        <Link href={`/food-requests/${r.id}`} className="font-mono text-[12.5px] font-medium text-ink transition-colors hover:text-gold-deep">{r.code}</Link>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <Link href={`/users/${r.userId}`} className="font-medium text-ink transition-colors hover:text-gold-deep">{r.user.fullName}</Link>
                        <span className="ml-2 font-mono text-[11.5px] text-muted-2">{r.user.code}</span>
                      </td>
                      <td className={`${TD} text-center`}>
                        <Link href={`/food-requests/${r.id}`} className="font-mono font-semibold text-navy-text transition-colors hover:text-gold-deep">{r._count.items}</Link>
                      </td>
                      <td className={`${TD} text-right font-mono font-semibold text-ink`}>{inr(r.amount)}</td>
                      <td className={`${TD} whitespace-nowrap text-ink-2`}>{r.requestedFor.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                      <td className={`${TD} text-ink-2`}>{r.vendor?.name ?? "—"}</td>
                      <td className={TD}>
                        <span className={`inline-flex items-center gap-2 text-[12.5px] font-medium ${meta.text}`}>
                          <span className={`size-[7px] rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className={TD}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/food-requests/${r.id}`} className={LINK_ACT_GOLD}>View</Link>
                          {canCancel && isCancellable(r.status) ? (
                            <ConfirmActionForm
                              action={cancelFoodRequestAction}
                              className="inline"
                              fields={{ id: r.id.toString() }}
                              confirm={{
                                title: "Cancel request",
                                message: `Cancel request ${r.code} for ${r.user.fullName}?`,
                                confirmLabel: "Yes, cancel",
                                tone: "danger",
                              }}
                              successMessage="Request cancelled."
                              buttonClassName={LINK_ACT_DANGER}
                            >
                              Cancel
                            </ConfirmActionForm>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={pageSize} total={total} />
      </div>
    </div>
  );
}
