import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { PANEL, TH, TD, BTN_GHOST } from "@/components/ui/controls";
import { FOOD_REQUEST_STATUS_META, isEditable, isCancellable } from "@/services/food-request";
import { cancelFoodRequestAction } from "../actions";
import { ApproveReject } from "../approve-reject";

function parseId(raw: string): bigint | null {
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export default async function FoodRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "foodRequests.view")) redirect("/dashboard");

  const { id: idStr } = await params;
  const id = parseId(idStr);
  if (!id) notFound();

  const req = await prisma.foodRequest.findUnique({
    where: { id },
    include: {
      user: { include: { category: true } },
      vendor: true,
      requestedBy: true,
      approvedBy: true,
      items: { include: { foodItem: true }, orderBy: { id: "asc" } },
      events: { include: { appUser: true }, orderBy: { id: "asc" } },
    },
  });
  if (!req) notFound();
  if (actor.branchId && req.branchId.toString() !== actor.branchId) notFound();

  const meta = FOOD_REQUEST_STATUS_META[req.status];
  const canEdit = can(actor, "foodRequests.edit") && isEditable(req.status);
  const canCancel = can(actor, "foodRequests.cancel") && isCancellable(req.status);
  const canApprove = can(actor, "foodRequests.approve") && req.status === "pending_approval";

  const META: { label: string; value: React.ReactNode }[] = [
    { label: "Charged to", value: <Link href={`/users/${req.userId}`} className="text-ink transition-colors hover:text-gold-deep">{req.user.fullName} <span className="font-mono text-muted-2">({req.user.code})</span></Link> },
    { label: "Category", value: req.user.category.name },
    { label: "Requested by", value: req.requestedBy.name },
    { label: "Vendor", value: req.vendor?.name ?? "Unassigned" },
    { label: "Delivery location", value: req.deliveryLocation },
    { label: "Delivery time", value: req.requestedFor.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) },
    { label: "Raised", value: req.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) },
    { label: "Purpose", value: req.purpose ?? "—" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] text-muted-2">
            <Link href="/food-requests" className="hover:text-gold-deep">Food Requests</Link> / {req.code}
          </p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-display text-[27px] font-bold tracking-[-0.6px] text-ink">{req.code}</h1>
            <span className={`inline-flex items-center gap-2 text-[13px] font-medium ${meta.text}`}>
              <span className={`size-[8px] rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {canEdit ? <Link href={`/food-requests/${req.id}/edit`} className={BTN_GHOST}>Edit</Link> : null}
          {canCancel ? (
            <ConfirmActionForm
              action={cancelFoodRequestAction}
              fields={{ id: req.id.toString() }}
              confirm={{ title: "Cancel request", message: `Cancel request ${req.code}?`, confirmLabel: "Yes, cancel", tone: "danger" }}
              successMessage="Request cancelled."
              buttonClassName={`${BTN_GHOST} !text-tomato hover:!bg-tomato-soft`}
            >
              Cancel request
            </ConfirmActionForm>
          ) : null}
        </div>
      </div>

      {canApprove ? <ApproveReject requestId={req.id.toString()} code={req.code} /> : null}

      {req.status === "rejected" && req.rejectReason ? (
        <p className="rounded-[12px] border border-tomato/30 bg-tomato-soft px-4 py-3 text-[13px] text-tomato">
          <span className="font-semibold">Rejected:</span> {req.rejectReason}
        </p>
      ) : null}

      {req.status === "delivered" && req.deliveredAt ? (
        <p className="rounded-[12px] border border-sage/40 bg-sage-soft px-4 py-3 text-[13px] text-sage-deep">
          <span className="font-semibold">Delivered</span> on{" "}
          {req.deliveredAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} — {inr(req.amount)} charged to
          the wallet (RFID verified). Recorded in the consumption ledger.
        </p>
      ) : null}

      {/* Meta */}
      <div className={`${PANEL} p-5`}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {META.map((m) => (
            <div key={m.label}>
              <dt className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-2">{m.label}</dt>
              <dd className="mt-1 text-[13.5px] text-ink-2">{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Items */}
      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left">
                <th className={TH}>Item</th>
                <th className={`${TH} text-right`}>Qty</th>
                <th className={`${TH} text-right`}>Unit</th>
                <th className={`${TH} text-right`}>Line total</th>
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
                  <td className={`${TD} text-right font-mono text-ink-2`}>{inr(it.unitPrice)}</td>
                  <td className={`${TD} text-right font-mono font-semibold text-ink`}>{inr(it.unitPrice.mul(it.qty))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-surface-2">
                <td className={`${TD} font-semibold text-ink`} colSpan={3}>Total charge</td>
                <td className={`${TD} text-right font-mono text-base font-bold text-gold-deep`}>{inr(req.amount)}</td>
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
                  <p className="text-[11.5px] text-muted-2">
                    {e.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    {e.appUser ? ` · ${e.appUser.name}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
