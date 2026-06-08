import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { RechargeForm } from "../recharge-form";
import { createRechargeAction } from "../actions";

export default async function NewRechargePage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "recharge.create")) redirect("/dashboard");

  const { userId } = await searchParams;
  let uid: bigint | null = null;
  try {
    if (userId) uid = BigInt(userId);
  } catch {
    uid = null;
  }

  const user = uid
    ? await prisma.user.findUnique({ where: { id: uid }, include: { category: true, wallet: true } })
    : null;

  if (!user || user.deletedAt || (actor.branchId && user.branchId.toString() !== actor.branchId)) {
    return (
      <div className="flex w-full flex-col gap-4 px-5 py-5 sm:px-8 sm:py-6">
        <h1 className="font-display text-2xl font-semibold text-ink">New recharge</h1>
        <p className="text-sm text-ink-2">
          Pick a cardholder first.{" "}
          <Link href="/recharge" className="font-medium text-gold-deep hover:underline">Search cardholders</Link>.
        </p>
      </div>
    );
  }

  const [meals, paymentModes] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true }, orderBy: { startTime: "asc" } }),
    prisma.paymentMode.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/recharge" className="hover:text-gold-deep">Recharge</Link> / New
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">Recharge {user.fullName}</h1>
        <p className="mt-1 text-sm text-ink-2">
          <span className="font-mono">{user.code}</span> · {user.category.name} · wallet{" "}
          <span className="font-mono text-ink">
            ₹{(user.wallet?.balanceAmount ?? new Prisma.Decimal(0)).toFixed(2)}
          </span>
        </p>
      </div>

      <RechargeForm
        action={createRechargeAction}
        userId={user.id.toString()}
        userName={user.fullName}
        meals={meals.map((m) => ({ id: m.id.toString(), name: m.name }))}
        paymentModes={paymentModes.map((p) => ({ id: p.id.toString(), name: p.name }))}
      />
    </div>
  );
}
