import { Sidebar } from "@/components/shell/sidebar";

/**
 * Authenticated app group: the floating white "plate" on the warm canvas with
 * the cream tray sidebar (theme.md §5). RBAC gating of this layout (redirect to
 * /login, permission checks) is wired in Phase 1.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen p-0 md:p-5">
      <div className="mx-auto flex min-h-screen overflow-hidden bg-surface shadow-lg md:min-h-[calc(100vh-2.5rem)] md:rounded-lg">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
