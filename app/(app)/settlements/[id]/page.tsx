import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can, canAccessBranch } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { StatCard } from "@/components/ui/stat-card";
import { BreakdownTable } from "@/components/reports/breakdown-table";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { usageByMeal } from "@/services/reporting";
import { recomputeSettlementAction, setSettlementStatusAction, deleteSettlementAction } from "../actions";

function statusDot(status: string) {
  return status === "paid" ? "bg-sage" : status === "approved" ? "bg-gold" : "bg-muted-2";
}

export default async function SettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "settlements.view")) redirect("/dashboard");
  const canManage = can(actor, "settlements.manage");

  const { id: idStr } = await params;
  let id: bigint;
  try {
    id = BigInt(idStr);
  } catch {
    notFound();
  }

  const s = await prisma.vendorSettlement.findUnique({ where: { id }, include: { vendor: true, branch: true } });
  if (!s || !canAccessBranch(actor, s.branchId.toString())) notFound();

  const toExclusive = new Date(s.periodEnd.getFullYear(), s.periodEnd.getMonth(), s.periodEnd.getDate() + 1);
  const breakdown = await usageByMeal(prisma, { branchId: s.branchId, from: s.periodStart, toExclusive });

  const isDraft = s.status === "draft";
  const isApproved = s.status === "approved";

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/settlements" className="text-xs text-ink-2 transition-colors hover:text-gold-deep">← Settlements</Link>
          <h1 className="font-display text-2xl font-semibold text-ink">{s.vendor.name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            <span className="font-mono">{s.vendor.code}</span> · {s.branch.name} ·{" "}
            <span className="font-mono">{s.periodStart.toISOString().slice(0, 10)} → {s.periodEnd.toISOString().slice(0, 10)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-3 py-1.5 text-sm text-ink-2">
            <span className={`size-2 rounded-pill ${statusDot(s.status)}`} />
            {s.status[0].toUpperCase() + s.status.slice(1)}
          </span>
          <a href={`/api/settlements/${s.id}`} className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
            Export CSV
          </a>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <StatCard label="Meals served" value={s.mealCount.toLocaleString("en-IN")} variant="sage" />
        <StatCard label="Vendor payable" value={inr(s.grossAmount)} hint="snapshot at this status" variant="gold" />
      </section>

      {canManage && s.status !== "paid" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface p-4">
          {isDraft ? (
            <ConfirmActionForm
              action={recomputeSettlementAction}
              fields={{ id: s.id.toString() }}
              confirm={{ title: "Recompute", message: "Re-snapshot meal counts and payable from current data?", confirmLabel: "Yes, recompute" }}
              successMessage="Settlement recomputed."
              buttonClassName="rounded-sm border border-line-strong bg-surface-2 px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep"
            >
              Recompute
            </ConfirmActionForm>
          ) : null}
          {isDraft ? (
            <ConfirmActionForm
              action={setSettlementStatusAction}
              fields={{ id: s.id.toString(), transition: "approve" }}
              confirm={{ title: "Approve settlement", message: "Approve this settlement? It freezes the snapshot and can then be marked paid.", confirmLabel: "Yes, approve" }}
              successMessage="Settlement approved."
              buttonClassName="rounded-sm bg-gold px-4 py-2 text-sm font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep"
            >
              Approve
            </ConfirmActionForm>
          ) : null}
          {isApproved ? (
            <ConfirmActionForm
              action={setSettlementStatusAction}
              fields={{ id: s.id.toString(), transition: "pay" }}
              confirm={{ title: "Mark as paid", message: "Mark this settlement as paid? This is the final state.", confirmLabel: "Yes, mark paid" }}
              successMessage="Settlement marked paid."
              buttonClassName="rounded-sm bg-sage px-4 py-2 text-sm font-semibold text-sage-deep transition-colors hover:bg-sage/80"
            >
              Mark paid
            </ConfirmActionForm>
          ) : null}
          {isDraft ? (
            <ConfirmActionForm
              action={deleteSettlementAction}
              fields={{ id: s.id.toString() }}
              confirm={{ title: "Delete settlement", message: "Delete this draft settlement? This can't be undone.", confirmLabel: "Yes, delete", tone: "danger" }}
              successMessage="Settlement deleted."
              buttonClassName="ml-auto rounded-sm px-4 py-2 text-sm font-medium text-tomato transition-colors hover:bg-tomato-soft"
            >
              Delete
            </ConfirmActionForm>
          ) : null}
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 font-display text-base font-semibold text-ink">
          Breakdown by meal {s.status !== "draft" ? <span className="text-xs font-normal text-muted">(live — snapshot above is frozen)</span> : null}
        </h2>
        <BreakdownTable title="Vendor payable by meal" unit="Meal" rows={breakdown} mode="vendor" />
      </div>
    </div>
  );
}
