"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";
import { useDismiss } from "./hooks";
import { ThemeToggle } from "./theme-toggle";
import { logoutAction } from "@/lib/auth-actions";
import type { ShellUser } from "./app-shell";

/**
 * Profile avatar + dropdown for the signed-in staff member: name + role, an
 * appearance (theme) control, and Sign out (server action).
 */
export function ProfileMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-pill p-1 pr-1.5 text-ink-2 transition-colors hover:bg-gold/10 focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
      >
        <span className="grid size-8 place-items-center rounded-pill bg-gold-soft text-gold-deep">
          <Icon name="user" className="size-[18px]" />
        </span>
        <Icon name="chevronDown" className="hidden size-4 sm:block" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-md border border-line bg-surface shadow-lg"
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="grid size-10 place-items-center rounded-pill bg-gold-soft text-gold-deep">
              <Icon name="user" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.role}</p>
            </div>
          </div>

          <div className="border-b border-line p-1.5">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-sm px-3 py-2 text-sm text-ink-2 transition-colors hover:bg-gold/10 hover:text-gold-deep"
            >
              <Icon name="settings" className="size-[18px]" />
              Account &amp; password
            </Link>
          </div>

          <div className="border-b border-line p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-ink-2">Appearance</span>
              <ThemeToggle />
            </div>
          </div>

          <div className="p-1.5">
            <form action={logoutAction}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-ink-2 transition-colors hover:bg-tomato-soft hover:text-tomato"
              >
                <Icon name="logout" className="size-[18px]" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
