import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { formatDateInZone, formatDateTimeInZone } from "@/lib/time";
import { PrintButton } from "../print-button";

function fmtDate(d: Date | null) {
  return d ? formatDateInZone(d) : "—";
}

export default async function RechargeReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "recharge.view")) redirect("/dashboard");

  const { id } = await params;
  let rechargeId: bigint;
  try {
    rechargeId = BigInt(id);
  } catch {
    notFound();
  }

  const r = await prisma.recharge.findUnique({
    where: { id: rechargeId },
    include: {
      user: { include: { category: true, branch: true } },
      paymentMode: true,
      appUser: true,
      coupons: { include: { mealType: true } },
    },
  });
  if (!r) notFound();
  if (actor.branchId && r.user.branchId.toString() !== actor.branchId) redirect("/recharge");

  const statusLabel = r.status[0].toUpperCase() + r.status.slice(1);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <p className="text-xs text-muted">
          <Link href="/recharge" className="hover:text-gold-deep">Recharge</Link> / Receipt
        </p>
        <PrintButton />
      </div>

      <div className="rounded-md border border-line bg-surface p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink">Recharge receipt</h1>
            <p className="mt-1 text-sm text-ink-2">
              #{r.id.toString()} · {formatDateTimeInZone(r.rechargedAt)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-3 py-1 text-sm text-ink-2">
            <span className={`size-2 rounded-pill ${r.status === "posted" ? "bg-sage" : r.status === "expired" ? "bg-muted-2" : "bg-tomato"}`} />
            {statusLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-3">
          <Field label="Cardholder" value={r.user.fullName} />
          <Field label={r.user.category.identifierLabel} value={r.user.code} mono />
          <Field label="Category" value={r.user.category.name} />
          <Field label="Branch" value={r.user.branch.name} />
          <Field label="Payment mode" value={r.paymentMode.name} />
          <Field label="Operator" value={r.appUser?.name ?? "Self Recharge"} />
          {r.transactionId ? <Field label="Transaction ID" value={r.transactionId} mono /> : null}
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-line py-4 sm:grid-cols-3">
          <Field label="Wallet amount" value={`₹${r.amount.toFixed(2)}`} mono big />
          <Field label="Unspent wallet" value={`₹${r.remainingAmount.toFixed(2)}`} mono />
          <Field label="Valid till" value={fmtDate(r.validTill)} />
        </div>

        {r.coupons.length > 0 ? (
          <div className="border-t border-line py-4">
            <p className="mb-2 text-[11px] uppercase tracking-[0.06em] text-muted">Coupon grants</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-2">
                  <th className="py-1 font-medium">Meal</th>
                  <th className="py-1 text-right font-medium">Granted</th>
                  <th className="py-1 text-right font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {r.coupons.map((c) => (
                  <tr key={c.id.toString()} className="border-t border-line">
                    <td className="py-1.5 text-ink">{c.mealType.name}</td>
                    <td className="py-1.5 text-right font-mono text-ink">{c.count}</td>
                    <td className="py-1.5 text-right font-mono text-ink-2">{c.remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {r.remarks ? (
          <div className="border-t border-line pt-4">
            <Field label="Remarks" value={r.remarks} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, value, mono, big }: { label: string; value: string; mono?: boolean; big?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className={`mt-0.5 text-ink ${mono ? "font-mono" : ""} ${big ? "text-lg font-semibold" : ""}`}>{value}</p>
    </div>
  );
}
