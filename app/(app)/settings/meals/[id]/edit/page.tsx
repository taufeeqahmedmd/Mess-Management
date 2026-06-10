import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { MealForm, type MealData } from "../../meal-form";
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

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/settings/meals" className="hover:text-gold-deep">Meals</Link> / {m.name}
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">Edit meal</h1>
        <p className="mt-1 text-sm text-ink-2">
          The default window below applies to every counter serving this meal, unless a counter sets
          its own (narrower) window on the Counters page.
        </p>
      </div>
      <MealForm action={updateMealAction} meal={meal} />
    </div>
  );
}
