import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { landingFor } from "@/lib/landing";

/**
 * Root route — send each signed-in staff member to their own home screen (a
 * Mess Incharge to /counter, a Vendor to /vendor-orders, an admin to /dashboard,
 * …). This is where login lands, so the landing is role-aware in one hop instead
 * of bouncing through a screen the actor can't open. Unauthenticated visitors are
 * redirected to /login by requireActor.
 */
export default async function Home() {
  const actor = await requireActor();
  redirect(landingFor(actor));
}
