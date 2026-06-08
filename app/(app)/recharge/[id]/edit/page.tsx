import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { RechargeForm, type RechargeInitial } from "../../recharge-form";
import { editRechargeAction } from "../../actions";

export default async function EditRechargePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "recharge.edit")) redirect("/dashboard");

  const { id } = await params;
  let rechargeId: bigint;
  try {
    rechargeId = BigInt(id);
  } catch {
    notFound();
  }

  const recharge = await prisma.recharge.findUnique({
    where: { id: rechargeId },
    include: { user: true, coupons: true },
  });
  if (!recharge) notFound();
  if (actor.branchId && recharge.user.branchId.toString() !== actor.branchId) redirect("/recharge");
  if (recharge.status !== "posted") {
    return (
      <div className="flex w-full flex-col gap-4 px-5 py-5 sm:px-8 sm:py-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Edit recharge</h1>
        <p className="text-sm text-ink-2">
          This recharge is <span className="font-medium">{recharge.status}</span> and can no longer
          be edited. <Link href="/recharge" className="font-medium text-gold-deep hover:underline">Back to recharges</Link>.
        </p>
      </div>
    );
  }

  const [meals, paymentModes] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true }, orderBy: { startTime: "asc" } }),
    prisma.paymentMode.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const couponsByMeal: Record<string, number> = {};
  for (const c of recharge.coupons) couponsByMeal[c.mealTypeId.toString()] = c.count;

  const initial: RechargeInitial = {
    amount: recharge.amount.toFixed(2),
    coupons: couponsByMeal,
    validTill: recharge.validTill ? recharge.validTill.toISOString().slice(0, 10) : "",
    paymentModeId: recharge.paymentModeId.toString(),
    remarks: recharge.remarks ?? "",
  };

  return (
    <div className="flex w-full flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <p className="text-xs text-muted">
          <Link href="/recharge" className="hover:text-gold-deep">Recharge</Link> / Edit
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">Edit recharge — {recharge.user.fullName}</h1>
      </div>

      <RechargeForm
        action={editRechargeAction}
        userId={recharge.userId.toString()}
        userName={recharge.user.fullName}
        rechargeId={recharge.id.toString()}
        initial={initial}
        meals={meals.map((m) => ({ id: m.id.toString(), name: m.name }))}
        paymentModes={paymentModes.map((p) => ({ id: p.id.toString(), name: p.name }))}
      />
    </div>
  );
}
