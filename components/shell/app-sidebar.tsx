"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, Icon, type IconName } from "./icons";

type NavItem = { label: string; href: string; icon: IconName; permission?: string };
type NavSection = { title: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "dashboard", permission: "dashboard.view" },
      {
        label: "Vendor Dashboard",
        href: "/vendor-dashboard",
        icon: "vendor",
        permission: "vendorDashboard.view",
      },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Counter", href: "/counter", icon: "counter", permission: "counter.operate" },
      { label: "Food Requests", href: "/food-requests", icon: "cart", permission: "foodRequests.view" },
      { label: "Vendor Orders", href: "/vendor-orders", icon: "bag", permission: "foodRequests.vendor" },
    ],
  },
  {
    title: "Manage",
    items: [
      { label: "Cardholders", href: "/users", icon: "users", permission: "users.view" },
      { label: "RFID Cards", href: "/cards", icon: "card", permission: "cards.view" },
      { label: "Reports", href: "/reports", icon: "reports", permission: "reports.view" },
      {
        label: "Vendor Settlement",
        href: "/settlements",
        icon: "vendor",
        permission: "settlements.view",
      },
      { label: "Settings", href: "/settings", icon: "settings", permission: "settings.manage" },
      {
        label: "Access Control",
        href: "/access-control",
        icon: "shield",
        permission: "accessControl.manage",
      },
    ],
  },
  {
    title: "Notifications Management",
    items: [
      { label: "Push Notifications", href: "/notifications/push", icon: "bell", permission: "notifications.manage" },
      { label: "Email Notifications", href: "/notifications/email", icon: "mail", permission: "notifications.manage" },
      { label: "WhatsApp Communication", href: "/notifications/whatsapp", icon: "chat", permission: "notifications.manage" },
    ],
  },
];

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function AppSidebar({
  expanded,
  mobileOpen,
  onNavigate,
  permissions,
  isSuperAdmin,
}: {
  expanded: boolean;
  mobileOpen: boolean;
  onNavigate: () => void;
  permissions: string[];
  isSuperAdmin: boolean;
}) {
  const pathname = usePathname();
  const allowed = new Set(permissions);
  const visible = (item: NavItem) =>
    !item.permission || isSuperAdmin || allowed.has(item.permission);

  const sections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter(visible),
  })).filter((s) => s.items.length > 0);

  return (
    <aside
      aria-label="Primary"
      className={cx(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col gap-4 overflow-y-auto border-r border-line bg-tray p-3.5 transition-transform duration-200",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        "md:sticky md:top-0 md:z-0 md:h-screen md:translate-x-0 md:transition-[width]",
        expanded ? "md:w-60" : "md:w-[76px]",
      )}
    >
      {/* Brand: Ashoka Chakra + wordmark + tricolour rule */}
      <div>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          aria-label="Mess Management — go to dashboard"
          className={cx(
            "flex items-center gap-3 rounded-sm px-2 py-1.5 focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20",
            !expanded && "md:justify-center md:px-0",
          )}
        >
          <Logo className="h-[34px] shrink-0" />
          <div className={cx("min-w-0", !expanded && "md:hidden")}>
            <div className="truncate font-display text-base font-bold leading-tight text-ink">
              Mess Management
            </div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.04em] text-muted-2">
              K-innovative Hub
            </div>
          </div>
        </Link>
        <div className={cx("tricolour mt-3.5", !expanded && "md:mx-1")} />
      </div>

      {sections.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <span
            className={cx(
              "px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted",
              !expanded && "md:hidden",
            )}
          >
            {section.title}
          </span>

          {section.items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={!expanded ? item.label : undefined}
                className={cx(
                  "flex items-center gap-3 rounded-sm px-2.5 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-gold-soft-2 font-semibold text-gold-deep"
                    : "text-ink-2 hover:bg-gold-soft hover:text-gold-deep",
                  !expanded && "md:justify-center md:px-0",
                )}
              >
                <Icon
                  name={item.icon}
                  className={cx("size-[18px] shrink-0", active ? "text-gold-deep" : "")}
                />
                <span className={cx("truncate", !expanded && "md:hidden")}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
