import { prisma } from "@/lib/prisma";

/**
 * The active vendor a staff login is attached to. Prefers the staff→vendor link
 * (`AppUser.vendorId`, set in Settings → Staff for Vendor / Mess Incharge roles),
 * so any staff member attached to a vendor sees that vendor's food requests in
 * the vendor portal. Falls back to the legacy single portal-operator link
 * (`Vendor.appUserId`) so vendors linked the old way keep working. Returns null
 * when there is no active vendor for this login.
 */
export async function vendorForActor(actorId: string | bigint): Promise<{ id: bigint; name: string } | null> {
  const uid = BigInt(actorId);

  const me = await prisma.appUser.findUnique({
    where: { id: uid },
    select: { vendor: { select: { id: true, name: true, status: true } } },
  });
  if (me?.vendor && me.vendor.status === "active") {
    return { id: me.vendor.id, name: me.vendor.name };
  }

  const legacy = await prisma.vendor.findFirst({
    where: { appUserId: uid, status: "active" },
    select: { id: true, name: true },
  });
  return legacy ?? null;
}
