"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string };

export function SettingsTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Configurations sections"
      className="flex gap-1.5 overflow-x-auto pb-1"
    >
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-pill px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-sage-deep text-white shadow-sm"
                : "text-ink-2 hover:bg-sage-soft hover:text-sage-deep"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
