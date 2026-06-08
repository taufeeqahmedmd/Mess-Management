import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";

/**
 * Authenticated app group. Middleware already gates these routes; we resolve the
 * session here to render the shell with the signed-in staff identity (and
 * redirect defensively if it's somehow absent). Per-permission gating of
 * individual screens/actions uses requirePermission() from lib/session.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = {
    name: session.user.name ?? "Staff",
    role: session.user.roleName,
  };

  return <AppShell user={user}>{children}</AppShell>;
}
