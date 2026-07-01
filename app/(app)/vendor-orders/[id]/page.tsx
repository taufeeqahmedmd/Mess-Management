import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { landingFor } from "@/lib/landing";
import { inr } from "@/lib/format";
import { PANEL, TH, TD } from "@/components/ui/controls";
import { FOOD_REQUEST_STATUS_META, vendorCanDecide, vendorAdvanceTarget, isAwaitingDelivery } from "@/services/food-request";
import { VendorActions } from "../vendor-actions";
import { DeliveryScan } from "../delivery-scan";

function parseId(raw: string): bigint | null {
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

const ADVANCE_LABEL: Record<string, string> = { preparing: "Mark preparing", out_for_delivery: "Mark out for delivery" };

export default async function VendorOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "foodRequests.vendor")) redirect(landingFor(actor));

  const vendor = await prisma.vendor.findFirst({ where: { appUserId: BigInt(actor.id), status: "active" } });
  if (!vendor) notFound();

  const { id: idStr } = await params;
  const id = parseId(idStr);
  if (!id) notFound();

  const req = await prisma.foodRequest.findUnique({
    where: { id },
    include: {
      user: { include: { category: true } },
      items: { include: { foodItem: true }, orderBy: { id: "asc" } },
      events: { include: { appUser: true }, orderBy: { id: "asc" } },
    },
  });
  if (!req || req.vendorId !== vendor.id) notFound();

  const meta = FOOD_REQUEST_STATUS_META[req.status];
  const advanceTarget = vendorAdvanceTarget(req.status);
  const advanceLabel = advanceTarget ? ADVANCE_LABEL[advanceTarget] ?? null : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-5 py-6 sm:px-7">
      <div>
        <p className="text-[12px] text-muted-2">
          <Link href="/vendor-orders" className="hover:text-gold-deep">Vendor orders</Link> / {req.code}
        </p>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">{req.code}</h1>
          <span className={`inline-flex items-center gap-2 text-[13px] font-medium ${meta.text}`}>
            <span className={`size-[8px] rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </div>
      </div>

      <VendorActions
        requestId={req.id.toString()}
        code={req.code}
        canDecide={vendorCanDecide(req.status)}
        advanceLabel={advanceLabel}
      />

      {isAwaitingDelivery(req.status) ? <DeliveryScan requestId={req.id.toString()} /> : null}

      {/* Delivery details */}
      <div className={`${PANEL} p-5`}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-2">Delivery location</dt>
            <dd className="mt-1 text-[13.5px] text-ink-2">{req.deliveryLocation}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-2">Delivery time</dt>
            <dd className="mt-1 text-[13.5px] text-ink-2">{req.requestedFor.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-2">For</dt>
            <dd className="mt-1 text-[13.5px] text-ink-2">{req.user.fullName} · {req.user.category.name}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-2">Purpose</dt>
            <dd className="mt-1 text-[13.5px] text-ink-2">{req.purpose ?? "—"}</dd>
          </div>
        </dl>
      </div>

      {/* Items */}
      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Item</th>
                <th className={`${TH} text-right`}>Qty</th>
                <th className={`${TH} text-right`}>Vendor unit</th>
                <th className={`${TH} text-right`}>Line</th>
              </tr>
            </thead>
            <tbody>
              {req.items.map((it) => (
                <tr key={it.id.toString()} className="border-b border-line last:border-0">
                  <td className={TD}>
                    <span className="font-medium text-ink">{it.foodItem.name}</span>
                    {it.description ? <span className="ml-2 text-[12px] text-muted-2">— {it.description}</span> : null}
                  </td>
                  <td className={`${TD} text-right font-mono text-ink-2`}>{it.qty}</td>
                  <td className={`${TD} text-right font-mono text-ink-2`}>{inr(it.unitVendorPrice)}</td>
                  <td className={`${TD} text-right font-mono font-semibold text-ink`}>{inr(it.unitVendorPrice.mul(it.qty))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-surface-2">
                <td className={`${TD} font-semibold text-ink`} colSpan={3}>Total payable to vendor</td>
                <td className={`${TD} text-right font-mono text-base font-bold text-gold-deep`}>{inr(req.vendorAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Timeline */}
      <div className={`${PANEL} p-5`}>
        <h2 className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-2">Timeline</h2>
        <ol className="flex flex-col gap-3">
          {req.events.map((e) => {
            const em = FOOD_REQUEST_STATUS_META[e.toStatus];
            return (
              <li key={e.id.toString()} className="flex items-start gap-3">
                <span className={`mt-1.5 size-[8px] shrink-0 rounded-full ${em.dot}`} />
                <div className="min-w-0">
                  <p className="text-[13px] text-ink">
                    <span className="font-medium">{em.label}</span>
                    {e.note ? <span className="text-muted-2"> · {e.note}</span> : null}
                  </p>
                  <p className="text-[11.5px] text-muted-2">{e.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
