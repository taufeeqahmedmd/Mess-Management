"use client";

import { Suspense, useState } from "react";
import { AppNavbar } from "./app-navbar";
import { AppSidebar } from "./app-sidebar";
import { useMediaQuery } from "./hooks";
import { FlashToast } from "@/components/ui/flash-toast";
import { SEARCHABLE_PERMISSIONS } from "@/lib/rbac";

/**
 * App shell (Bhojan Tricolour): a full-height [sidebar | (topbar over content)]
 * layout. The sidebar carries the brand (Ashoka Chakra + wordmark) and nav; the
 * topbar carries search, the appearance toggle, notifications, and profile. The
 * navbar's menu button collapses the rail on desktop and opens an off-canvas
 * drawer on mobile. Theme tokens throughout.
 */
export type ShellUser = { name: string; role: string };

export function AppShell({
  user,
  permissions,
  isSuperAdmin,
  children,
}: {
  user: ShellUser;
  permissions: string[];
  isSuperAdmin: boolean;
  children: React.ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [railExpanded, setRailExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const canSearch = isSuperAdmin || SEARCHABLE_PERMISSIONS.some((p) => permissions.includes(p));

  function handleMenuClick() {
    if (isDesktop) {
      setRailExpanded((v) => !v);
    } else {
      setMobileOpen((v) => !v);
    }
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>

      <AppSidebar
        expanded={railExpanded}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
        permissions={permissions}
        isSuperAdmin={isSuperAdmin}
      />

      {/* Mobile drawer backdrop */}
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-ink/40 md:hidden"
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <AppNavbar onMenuClick={handleMenuClick} user={user} canSearch={canSearch} />
        <main className="min-w-0 flex-1 overflow-x-hidden bg-canvas">{children}</main>
      </div>
    </div>
  );
}
