import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { isEditable } from "@/services/food-request";
import { FoodRequestForm } from "../../food-request-form";
import { editFoodRequestAction } from "../../actions";

function parseId(raw: string): bigint | null {
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

/** Format a Date for an <input type="datetime-local"> value (local, no seconds). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditFoodRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "foodRequests.edit")) redirect("/dashboard");

  const { id: idStr } = await params;
  const id = parseId(idStr);
  if (!id) notFound();

  const req = await prisma.foodRequest.findUnique({
    where: { id },
    include: { user: { include: { category: true } }, items: { orderBy: { id: "asc" } } },
  });
  if (!req) notFound();
  if (actor.branchId && req.branchId.toString() !== actor.branchId) notFound();
  if (!isEditable(req.status)) redirect(`/food-requests/${req.id}`);

  const [catalog, vendors] = await Promise.all([
    prisma.foodItem.findMany({
      where: { active: true, OR: [{ branchId: null }, { branchId: req.user.branchId }] },
      orderBy: { name: "asc" },
    }),
    prisma.vendor.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-6 sm:px-7">
      <div>
        <p className="text-[12px] text-muted-2">
          <Link href="/food-requests" className="hover:text-gold-deep">Food Requests</Link> /{" "}
          <Link href={`/food-requests/${req.id}`} className="hover:text-gold-deep">{req.code}</Link> / Edit
        </p>
        <h1 className="mt-1 font-display text-[27px] font-bold tracking-[-0.6px] text-ink">Edit {req.code}</h1>
        <p className="mt-1 text-sm text-ink-2">
          <span className="font-mono">{req.user.code}</span> · {req.user.fullName} · {req.user.category.name}
        </p>
      </div>

      <FoodRequestForm
        action={editFoodRequestAction}
        userId={req.userId.toString()}
        userName={req.user.fullName}
        requestId={req.id.toString()}
        catalog={catalog.map((c) => ({ id: c.id.toString(), name: c.name, kind: c.kind, unitPrice: c.unitPrice.toFixed(2) }))}
        vendors={vendors.map((v) => ({ id: v.id.toString(), name: v.name }))}
        initial={{
          vendorId: req.vendorId?.toString() ?? "",
          deliveryLocation: req.deliveryLocation,
          requestedFor: toLocalInput(req.requestedFor),
          purpose: req.purpose ?? "",
          items: req.items.map((i) => ({ foodItemId: i.foodItemId.toString(), qty: i.qty, description: i.description ?? "" })),
        }}
      />
    </div>
  );
}
