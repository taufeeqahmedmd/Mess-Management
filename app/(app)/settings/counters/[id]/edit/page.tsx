import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CounterForm, type CounterData } from "../../counter-form";
import { OperatorsForm, type StaffOption } from "../../operators-form";
import { CounterMealsForm, type Assignment } from "../../counter-meals-form";
import { updateCounterAction } from "../../actions";

export default async function EditCounterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "counters.manage")) redirect("/dashboard");

  const { id } = await params;
  let counterId: bigint;
  try {
    counterId = BigInt(id);
  } catch {
    notFound();
  }

  const counter = await prisma.counter.findUnique({
    where: { id: counterId },
    include: { operators: true, meals: true, branch: { select: { code: true, name: true } } },
  });
  if (!counter) notFound();

  const [staff, meals] = await Promise.all([
    prisma.appUser.findMany({
      where: { deletedAt: null, status: "active" },
      include: { role: true },
      orderBy: { name: "asc" },
    }),
    prisma.mealType.findMany({ where: { active: true }, orderBy: { startTime: "asc" } }),
  ]);
  const mealRows = meals.map((m) => ({
    id: m.id.toString(),
    name: m.name,
    code: m.code,
    defaultStart: m.startTime,
    defaultEnd: m.endTime,
  }));
  const mealAssignments: Record<string, Assignment> = {};
  for (const cm of counter.meals) {
    mealAssignments[cm.mealTypeId.toString()] = { startTime: cm.startTime, endTime: cm.endTime };
  }
  const staffOptions: StaffOption[] = staff.map((s) => ({
    id: s.id.toString(),
    name: s.name,
    mobile: s.mobile,
    role: s.role.name,
  }));
  const assignedIds = counter.operators.map((o) => o.appUserId.toString());

  const counterData: CounterData = {
    id: counter.id.toString(),
    code: counter.code,
    name: counter.name,
    status: counter.status === "inactive" ? "inactive" : "active",
  };

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <p className="text-xs text-muted">
          <Link href="/settings/counters" className="hover:text-gold-deep">Counters</Link> / {counter.name}
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">Edit counter</h1>
        <p className="mt-1 text-sm text-ink-2">Branch: <span className="text-ink">{counter.branch.name} ({counter.branch.code})</span></p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold text-ink">Details</h2>
        <CounterForm action={updateCounterAction} counter={counterData} />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Meals &amp; service windows</h2>
          <p className="mt-1 text-sm text-ink-2">Which meals this counter serves, and when (within each meal&rsquo;s default window).</p>
        </div>
        <CounterMealsForm counterId={counterData.id} meals={mealRows} assignments={mealAssignments} />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Operators</h2>
          <p className="mt-1 text-sm text-ink-2">Staff who may sign in and run this counter.</p>
        </div>
        <OperatorsForm counterId={counterData.id} staff={staffOptions} assignedIds={assignedIds} />
      </section>
    </div>
  );
}
