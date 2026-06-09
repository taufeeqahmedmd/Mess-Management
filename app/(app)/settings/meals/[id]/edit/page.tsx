import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { MealForm, type MealData } from "../../meal-form";
import { MealCountersForm, type Assignment } from "../../meal-counters-form";
import { updateMealAction } from "../../actions";

export default async function EditMealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "meals.manage")) redirect("/dashboard");

  const { id } = await params;
  let mealId: bigint;
  try {
    mealId = BigInt(id);
  } catch {
    notFound();
  }

  const m = await prisma.mealType.findUnique({ where: { id: mealId } });
  if (!m) notFound();

  const meal: MealData = {
    id: m.id.toString(),
    code: m.code,
    name: m.name,
    startTime: m.startTime,
    endTime: m.endTime,
    active: m.active,
  };

  // Branch-scoped counters + this meal's current per-counter windows.
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;
  const [counters, current] = await Promise.all([
    prisma.counter.findMany({
      where: { status: "active", deletedAt: null, ...(branchId ? { branchId } : {}) },
      include: { branch: true },
      orderBy: [{ branch: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.counterMeal.findMany({ where: { mealTypeId: mealId } }),
  ]);
  const assignments: Record<string, Assignment> = {};
  for (const cm of current) {
    assignments[cm.counterId.toString()] = { startTime: cm.startTime, endTime: cm.endTime };
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-xs text-muted">
            <Link href="/settings/meals" className="hover:text-gold-deep">Meals</Link> / {m.name}
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">Edit meal</h1>
        </div>
        <MealForm action={updateMealAction} meal={meal} />
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Counters &amp; service windows</h2>
          <p className="mt-1 text-sm text-ink-2">
            Which counters serve <span className="font-medium text-ink">{m.name}</span>, and when. The
            meal&rsquo;s own times above are the default; a counter&rsquo;s window here overrides them
            at that counter.
          </p>
        </div>
        <MealCountersForm
          mealId={meal.id}
          mealName={m.name}
          defaultStart={m.startTime}
          defaultEnd={m.endTime}
          counters={counters.map((c) => ({
            id: c.id.toString(),
            name: c.name,
            code: c.code,
            branch: c.branch.name,
          }))}
          assignments={assignments}
        />
      </div>
    </div>
  );
}
