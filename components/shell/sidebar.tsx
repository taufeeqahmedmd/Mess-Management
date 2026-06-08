import Link from "next/link";

/**
 * The cream "tray" sidebar (theme.md §6.1). Nav is static for Phase 0;
 * later phases gate items by permission. Active state is not wired to the
 * pathname yet — that arrives with the real navigation in Phase 1.
 */
type NavItem = { label: string; href: string };
type NavSection = { title: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard" }],
  },
  {
    title: "Operations",
    items: [
      { label: "Counter", href: "/counter" },
      { label: "Recharge", href: "/recharge" },
    ],
  },
  {
    title: "Manage",
    items: [
      { label: "Cardholders", href: "/users" },
      { label: "RFID Cards", href: "/cards" },
      { label: "Reports", href: "/reports" },
      { label: "Settings", href: "/settings" },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="hidden w-58 shrink-0 flex-col gap-6 bg-gradient-to-b from-tray-2 to-tray p-5 md:flex">
      <div className="px-2">
        <span className="font-display text-xl font-semibold text-ink">
          Mess<span className="text-gold-deep">·</span>Manage
        </span>
      </div>
      <nav className="flex flex-col gap-5">
        {SECTIONS.map((section) => (
          <div key={section.title} className="flex flex-col gap-1">
            <span className="px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              {section.title}
            </span>
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-sm px-3 py-2.5 text-sm text-ink-2 transition-colors hover:bg-gold/10 hover:text-gold-deep"
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
