"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string };

export function SettingsTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Configurations sections"
      className="flex gap-1.5 overflow-x-auto border-b border-line pb-px"
    >
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-pill px-[17px] py-2 text-[13px] font-medium transition-colors ${
              active
                ? "bg-gold text-white shadow-gold"
                : "text-muted hover:bg-gold-soft hover:text-gold-deep"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
