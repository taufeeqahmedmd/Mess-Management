import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { settlementStatusLabel } from "@/services/settlement";
import { PrinterGlyph } from "@/components/ui/glyphs";

const PAGE_SIZE = 20;

function statusDot(status: string) {
  return status === "paid" ? "bg-sage" : status === "approved" ? "bg-gold" : "bg-muted-2";
}

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "settlements.view")) redirect("/dashboard");
  const canManage = can(actor, "settlements.manage");

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const status = ["draft", "approved", "paid"].includes(sp.status ?? "") ? sp.status : undefined;
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;

  const where: Prisma.VendorSettlementWhereInput = {
    ...(branchId ? { branchId } : {}),
    ...(status ? { status: status as "draft" | "approved" | "paid" } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.vendorSettlement.findMany({
      where,
      include: { vendor: true, branch: true },
      orderBy: { id: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.vendorSettlement.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tab = (label: string, value?: string) => {
    const active = (value ?? undefined) === status;
    const qs = value ? `?status=${value}` : "";
    return (
      <Link
        key={label}
        href={`/settlements${qs}`}
        className={`rounded-pill px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-gold-soft text-ink" : "text-ink-2 hover:bg-gold/10 hover:text-gold-deep"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Vendor Settlement</h1>
          <p className="mt-1 text-sm text-ink-2">Period settlements — meal counts × vendor rate.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/settings/vendors" className="rounded-sm border border-line-strong bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep">
            Vendors
          </Link>
          {canManage ? (
            <Link href="/settlements/new" className="rounded-sm bg-gold px-4 py-2.5 text-sm font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep">
              New settlement
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tab("All")}
        {tab("Draft", "draft")}
        {tab("Invoice Raised", "approved")}
        {tab("Paid", "paid")}
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">Vendor</th>
              <th className="px-4 py-3 font-semibold">Branch</th>
              <th className="px-4 py-3 font-semibold">Period</th>
              <th className="px-4 py-3 text-right font-semibold">Meals</th>
              <th className="px-4 py-3 text-right font-semibold">Payable</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-2">No settlements yet.</td></tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id.toString()} className="border-t border-line">
                  <td className="px-4 py-3">
                    <Link href={`/settlements/${s.id}`} className="text-ink transition-colors hover:text-gold-deep">{s.vendor.name}</Link>
                    <span className="ml-1 font-mono text-xs text-muted">{s.vendor.code}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{s.branch.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-2">
                    {s.periodStart.toISOString().slice(0, 10)} → {s.periodEnd.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink-2">{s.mealCount.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink">{inr(s.grossAmount)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <span className={`size-2 rounded-pill ${statusDot(s.status)}`} />
                      {settlementStatusLabel(s.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.status !== "draft" ? (
                      <a
                        href={`/settlements/${s.id}/invoice`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep"
                        aria-label={`Print invoice for ${s.vendor.name}, ${s.periodStart.toISOString().slice(0, 10)} to ${s.periodEnd.toISOString().slice(0, 10)}`}
                      >
                        <PrinterGlyph className="size-[13px]" />
                        Print
                      </a>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-2">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={`/settlements?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page - 1) })}`} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">Previous</Link> : null}
            {page < totalPages ? <Link href={`/settlements?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page + 1) })}`} className="rounded-sm border border-line-strong bg-surface-2 px-3 py-1.5 font-medium text-ink-2 hover:border-gold hover:text-gold-deep">Next</Link> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
