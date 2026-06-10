import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { RatesEditor, type InitialRow } from "./rates-editor";
import { BranchSwitcher, type BranchItem } from "./branch-switcher";

export default async function RatesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "rates.manage")) redirect("/dashboard");
  const canEdit = can(actor, "rates.manage") && can(actor, "vendorRates.manage");

  // All-branch (Super Admin) actors pick which branch's rates to edit (via
  // ?branch=); scoped actors are pinned to their own branch.
  const allBranches: BranchItem[] = actor.branchId
    ? []
    : (
        await prisma.branch.findMany({
          where: { deletedAt: null, status: "active" },
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true },
        })
      ).map((b) => ({ id: b.id.toString(), code: b.code, name: b.name }));

  const { branch: requestedBranch } = await searchParams;
  let branch;
  if (actor.branchId) {
    branch = await prisma.branch.findUnique({ where: { id: BigInt(actor.branchId) } });
  } else {
    const requestedValid = requestedBranch && allBranches.some((b) => b.id === requestedBranch);
    branch = requestedValid
      ? await prisma.branch.findUnique({ where: { id: BigInt(requestedBranch) } })
      : await prisma.branch.findFirst({ where: { deletedAt: null }, orderBy: { id: "asc" } });
  }
  if (!branch) redirect("/dashboard");

  const [meals, categories, rates] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true }, orderBy: { startTime: "asc" } }),
    prisma.category.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    // Branch-level rates only (counter_id NULL) — rates are per branch, not per counter.
    prisma.mealRate.findMany({ where: { branchId: branch.id, counterId: null, validTo: null } }),
  ]);

  const mealOrder = new Map(meals.map((m, i) => [m.id.toString(), i]));

  // Build editor rows: one per meal, with category cells.
  const rowMap = new Map<string, InitialRow>();
  for (const r of rates) {
    const mealId = r.mealTypeId.toString();
    let row = rowMap.get(mealId);
    if (!row) {
      row = { mealId, cells: {} };
      rowMap.set(mealId, row);
    }
    row.cells[r.categoryId.toString()] = { charge: r.rate.toFixed(2), vendor: r.vendorRate.toFixed(2) };
  }
  const initialRows = [...rowMap.values()].sort(
    (a, b) => (mealOrder.get(a.mealId) ?? 0) - (mealOrder.get(b.mealId) ?? 0),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          Charge (sale) and vendor (cost) per meal × category for{" "}
          <span className="font-medium text-ink">{branch.name}</span>. Rates apply to the whole branch.
          Profit/Loss = charge − vendor.
        </p>
        {allBranches.length > 1 ? (
          <BranchSwitcher branches={allBranches} current={branch.id.toString()} />
        ) : null}
      </div>

      {canEdit ? (
        <RatesEditor
          // Remount on branch change so the grid re-initializes with the new
          // branch's rows instead of keeping the previous branch's state.
          key={branch.id.toString()}
          branchId={branch.id.toString()}
          meals={meals.map((m) => ({ id: m.id.toString(), name: m.name }))}
          categories={categories.map((c) => ({ id: c.id.toString(), name: c.name }))}
          initialRows={initialRows}
        />
      ) : (
        <p className="rounded-sm bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
          You need both <span className="font-medium">Rates</span> and{" "}
          <span className="font-medium">Vendor Rates</span> permissions to edit rates.
        </p>
      )}
    </div>
  );
}
