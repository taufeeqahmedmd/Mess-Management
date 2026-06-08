import { AppShell } from "@/components/shell/app-shell";

/**
 * Authenticated app group. YouTube-style shell: top navbar (logo, search,
 * notifications, profile) + collapsible left sidebar. RBAC gating (redirect to
 * /login, permission checks) is wired in Phase 1.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
