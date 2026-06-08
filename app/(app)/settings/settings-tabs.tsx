"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string };

export function SettingsTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Configurations sections"
      className="-mb-px flex gap-1 overflow-x-auto border-b border-line"
    >
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              active
                ? "border-gold text-ink"
                : "border-transparent text-ink-2 hover:border-line-strong hover:text-gold-deep"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
