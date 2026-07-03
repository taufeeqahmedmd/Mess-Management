import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";

const schema = z.object({
  endpoint: z.string().url().max(1024),
  keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }),
});

/**
 * POST /api/notifications/subscribe — register the logged-in staff member's
 * browser push subscription (upsert on endpoint, which is globally unique — a
 * browser re-subscribing or a different login on the same browser rebinds it).
 * DELETE removes it (the "disable notifications" toggle).
 */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });

  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 255) || null;
  await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    update: { appUserId: BigInt(actor.id), p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, userAgent },
    create: {
      appUserId: BigInt(actor.id),
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });

  // Only the owner can remove their subscription row.
  await prisma.pushSubscription.deleteMany({ where: { endpoint, appUserId: BigInt(actor.id) } });
  return NextResponse.json({ ok: true });
}
