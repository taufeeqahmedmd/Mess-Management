import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { BTN_PRIMARY, INPUT_FIND, PANEL } from "@/components/ui/controls";
import { FoodRequestForm } from "../food-request-form";
import { createFoodRequestAction } from "../actions";

function parseId(raw: string | undefined): bigint | null {
  if (!raw) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export default async function NewFoodRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; q?: string; pick?: string }>;
}) {
  const actor = await requireActor();
  if (!can(actor, "foodRequests.create")) redirect("/dashboard");

  const { userId, q: rawQ, pick } = await searchParams;
  const q = (rawQ ?? "").trim();
  const branchFilter = actor.branchId ? { branchId: BigInt(actor.branchId) } : {};

  // Resolve the cardholder to charge: an explicit ?userId wins; otherwise — unless
  // the user is explicitly picking — auto-detect the logged-in staff's own linked
  // account so they can raise for themselves with no search.
  let uid = parseId(userId);
  let autoSelf = false;
  if (!uid && !pick) {
    const me = await prisma.appUser.findUnique({
      where: { id: BigInt(actor.id) },
      select: { cardholderUserId: true },
    });
    if (me?.cardholderUserId) {
      uid = me.cardholderUserId;
      autoSelf = true;
    }
  }

  const user = uid
    ? await prisma.user.findUnique({ where: { id: uid }, include: { category: true } })
    : null;
  const valid =
    user && !user.deletedAt && user.status === "active" && (!actor.branchId || user.branchId.toString() === actor.branchId);

  // --- No cardholder resolved → show the in-form picker (search) ---
  if (!valid) {
    const matches = q
      ? await prisma.user.findMany({
          where: {
            deletedAt: null,
            status: "active",
            ...branchFilter,
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { fullName: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { cards: { some: { cardUid: { contains: q } } } },
            ],
          },
          include: { category: true },
          orderBy: { fullName: "asc" },
          take: 10,
        })
      : [];

    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-6 sm:px-7">
        <div>
          <p className="text-[12px] text-muted-2">
            <Link href="/food-requests" className="hover:text-gold-deep">Food Requests</Link> / New
          </p>
          <h1 className="mt-1 font-display text-[27px] font-bold tracking-[-0.6px] text-ink">New food request</h1>
          <p className="mt-1 text-sm text-ink-2">Choose the cardholder whose RFID account will be charged.</p>
        </div>

        <div className={`${PANEL} p-[18px_20px]`}>
          <form method="get" className="flex flex-col gap-2.5 sm:flex-row">
            <input name="q" defaultValue={q} autoFocus placeholder="Search by name, code, phone, or card…" className={`${INPUT_FIND} sm:max-w-[420px]`} />
            <button type="submit" className={BTN_PRIMARY}>Search</button>
          </form>
          {q ? (
            <div className="mt-3 flex flex-col gap-1.5">
              {matches.length === 0 ? (
                <p className="text-sm text-muted">No active cardholders match.</p>
              ) : (
                matches.map((u) => (
                  <div key={u.id.toString()} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-surface-2 px-3 py-2 text-[13px]">
                    <span className="text-ink">
                      <span className="font-mono">{u.code}</span> · {u.fullName} · {u.category.name}
                    </span>
                    <Link href={`/food-requests/new?userId=${u.id}`} className={BTN_PRIMARY}>Select</Link>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // --- Cardholder resolved → show the request form ---
  const [catalog, vendors] = await Promise.all([
    prisma.foodItem.findMany({
      where: { active: true, OR: [{ branchId: null }, { branchId: user.branchId }] },
      orderBy: { name: "asc" },
    }),
    prisma.vendor.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
  ]);

  if (catalog.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-6 sm:px-7">
        <h1 className="font-display text-2xl font-semibold text-ink">New food request</h1>
        <p className="text-sm text-ink-2">
          No food items are configured yet. Add some under{" "}
          <Link href="/settings/food-items" className="font-medium text-gold-deep hover:underline">Settings → Food Items</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-6 sm:px-7">
      <div>
        <p className="text-[12px] text-muted-2">
          <Link href="/food-requests" className="hover:text-gold-deep">Food Requests</Link> / New
        </p>
        <h1 className="mt-1 font-display text-[27px] font-bold tracking-[-0.6px] text-ink">
          {autoSelf ? "Request for yourself" : `Request for ${user.fullName}`}
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          <span className="font-mono">{user.code}</span> · {user.category.name} · charged to this RFID account
          {" · "}
          <Link href="/food-requests/new?pick=1" className="font-medium text-gold-deep hover:underline">
            {autoSelf ? "raise for someone else" : "change cardholder"}
          </Link>
        </p>
      </div>

      <FoodRequestForm
        action={createFoodRequestAction}
        userId={user.id.toString()}
        userName={user.fullName}
        catalog={catalog.map((c) => ({ id: c.id.toString(), name: c.name, kind: c.kind, unitPrice: c.unitPrice.toFixed(2) }))}
        vendors={vendors.map((v) => ({ id: v.id.toString(), name: v.name }))}
      />
    </div>
  );
}
