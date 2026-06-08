"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

type NavItem = { label: string; href: string; icon: IconName };
type NavSection = { title: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: "dashboard" }],
  },
  {
    title: "Operations",
    items: [
      { label: "Counter", href: "/counter", icon: "counter" },
      { label: "Recharge", href: "/recharge", icon: "recharge" },
    ],
  },
  {
    title: "Manage",
    items: [
      { label: "Cardholders", href: "/users", icon: "users" },
      { label: "RFID Cards", href: "/cards", icon: "card" },
      { label: "Reports", href: "/reports", icon: "reports" },
      { label: "Settings", href: "/settings", icon: "settings" },
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
}: {
  expanded: boolean;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Primary"
      className={cx(
        "fixed bottom-0 left-0 top-14 z-50 flex w-64 flex-col gap-5 overflow-y-auto border-r border-line bg-gradient-to-b from-tray-2 to-tray p-3 transition-transform duration-200",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        // desktop: in flow, always visible, width toggles between full and rail
        "md:static md:top-0 md:z-0 md:translate-x-0 md:transition-[width]",
        expanded ? "md:w-60" : "md:w-[76px]",
      )}
    >
      {SECTIONS.map((section) => (
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
                  "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-gold-soft font-semibold text-ink"
                    : "text-ink-2 hover:bg-gold/10 hover:text-gold-deep",
                  !expanded && "md:justify-center md:px-0",
                )}
              >
                <Icon
                  name={item.icon}
                  className={cx(
                    "size-5 shrink-0",
                    active ? "text-gold-deep" : "",
                  )}
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
