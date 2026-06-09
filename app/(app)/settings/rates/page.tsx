import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { RatesEditor, type InitialRow } from "./rates-editor";

export default async function RatesPage() {
  const actor = await requireActor();
  if (!can(actor, "rates.manage")) redirect("/dashboard");
  const canEdit = can(actor, "rates.manage") && can(actor, "vendorRates.manage");

  const branch = actor.branchId
    ? await prisma.branch.findUnique({ where: { id: BigInt(actor.branchId) } })
    : await prisma.branch.findFirst({ orderBy: { id: "asc" } });
  if (!branch) redirect("/dashboard");

  const [meals, categories, rates, counters, counterMeals] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true }, orderBy: { startTime: "asc" } }),
    prisma.category.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
    prisma.mealRate.findMany({ where: { branchId: branch.id, validTo: null } }), // all current rates (defaults + counter-specific)
    prisma.counter.findMany({
      where: { branchId: branch.id, status: "active", deletedAt: null },
      orderBy: { code: "asc" },
    }),
    prisma.counterMeal.findMany({
      where: { active: true, counter: { branchId: branch.id } },
      select: { mealTypeId: true, counterId: true },
    }),
  ]);

  // counterId → [mealId] (only the meals each counter serves).
  const mealsByCounter: Record<string, string[]> = {};
  for (const cm of counterMeals) {
    (mealsByCounter[cm.counterId.toString()] ??= []).push(cm.mealTypeId.toString());
  }

  const mealOrder = new Map(meals.map((m, i) => [m.id.toString(), i]));

  // Build editor rows: one per (counter | default) × meal, with category cells.
  const rowMap = new Map<string, InitialRow>();
  for (const r of rates) {
    const counterId = r.counterId ? r.counterId.toString() : "";
    const mealId = r.mealTypeId.toString();
    const key = `${counterId}:${mealId}`;
    let row = rowMap.get(key);
    if (!row) {
      row = { counterIds: counterId ? [counterId] : [], mealId, cells: {} };
      rowMap.set(key, row);
    }
    row.cells[r.categoryId.toString()] = { charge: r.rate.toFixed(2), vendor: r.vendorRate.toFixed(2) };
  }
  // Defaults (no counter) first, then by meal order.
  const initialRows = [...rowMap.values()].sort((a, b) => {
    if (a.counterIds.length !== b.counterIds.length) return a.counterIds.length - b.counterIds.length;
    return (mealOrder.get(a.mealId) ?? 0) - (mealOrder.get(b.mealId) ?? 0);
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-ink-2">
          Charge (sale) and vendor (cost) per meal × category for{" "}
          <span className="font-medium text-ink">{branch.name}</span>. Leave{" "}
          <span className="font-medium">Counter</span> empty for the branch default; pick one or more
          counters to override them. Profit/Loss = charge − vendor.
        </p>
      </div>

      {canEdit ? (
        <RatesEditor
          branchId={branch.id.toString()}
          counters={counters.map((c) => ({ id: c.id.toString(), name: c.name, code: c.code }))}
          meals={meals.map((m) => ({ id: m.id.toString(), name: m.name }))}
          categories={categories.map((c) => ({ id: c.id.toString(), name: c.name }))}
          mealsByCounter={mealsByCounter}
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
