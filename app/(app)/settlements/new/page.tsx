import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { generateSettlementAction } from "../actions";
import { SettlementForm } from "../settlement-form";

function monthRange(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(now) };
}

export default async function NewSettlementPage() {
  const actor = await requireActor();
  if (!can(actor, "settlements.manage")) redirect("/settlements");

  const branchId = actor.branchId ? BigInt(actor.branchId) : null;
  const [vendors, branches, scoped] = await Promise.all([
    prisma.vendor.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    branchId ? Promise.resolve([]) : prisma.branch.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    branchId ? prisma.branch.findUnique({ where: { id: branchId } }) : Promise.resolve(null),
  ]);

  const { start, end } = monthRange(new Date());

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <Link href="/settlements" className="text-xs text-ink-2 transition-colors hover:text-gold-deep">← Settlements</Link>
        <h1 className="font-display text-2xl font-semibold text-ink">New settlement</h1>
        <p className="mt-1 text-sm text-ink-2">
          Snapshot the vendor payable for a branch over a period (Σ vendor rate × meals served).
        </p>
      </div>

      <SettlementForm
        action={generateSettlementAction}
        vendors={vendors.map((v) => ({ id: v.id.toString(), code: v.code, name: v.name }))}
        branches={branches.map((b) => ({ id: b.id.toString(), name: b.name }))}
        scopedBranch={scoped ? { id: scoped.id.toString(), name: scoped.name } : null}
        defaultStart={start}
        defaultEnd={end}
      />
    </div>
  );
}
