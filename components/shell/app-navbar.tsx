"use client";

import Link from "next/link";
import Image from "next/image";
import { Icon } from "./icons";
import { NotificationsMenu } from "./notifications-menu";
import { ProfileMenu } from "./profile-menu";
import type { ShellUser } from "./app-shell";

/**
 * Top app bar (YouTube-style): menu button + logo/title on the left, a centered
 * search field, notifications + profile on the right. Sticky, full-width.
 * The search submits to the branch-scoped cardholder directory (/users?q=…),
 * matching name / ID / phone / email / card UID. Only shown to staff who can
 * view cardholders; hidden on phones (the rail's Cardholders link is one tap).
 */
export function AppNavbar({
  onMenuClick,
  user,
  canSearch = false,
}: {
  onMenuClick: () => void;
  user: ShellUser;
  canSearch?: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface px-3 sm:px-4">
      {/* Left: menu + logo + title */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Toggle navigation menu"
          onClick={onMenuClick}
          className="grid size-10 place-items-center rounded-pill text-ink-2 transition-colors hover:bg-gold/10 hover:text-gold-deep focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
        >
          <Icon name="menu" className="size-[22px]" />
        </button>

        <Link
          href="/dashboard"
          aria-label="Mess Management — go to dashboard"
          className="flex items-center gap-2 rounded-sm px-1 focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
        >
          <Image
            src="/assets/images/logo/logo.svg"
            alt=""
            width={32}
            height={32}
            unoptimized
            priority
            className="size-8 shrink-0"
          />
          <span className="hidden font-display text-lg font-semibold text-ink sm:inline">
            Mess Management
          </span>
        </Link>
      </div>

      {/* Center: search → cardholder directory. Hidden on phones; the flex-1
          spacer keeps the right cluster pinned even when the form isn't shown. */}
      <div className="flex min-w-0 flex-1 justify-center px-2">
        {canSearch ? (
          <form
            role="search"
            method="get"
            action="/users"
            className="hidden w-full max-w-xl items-center gap-2 rounded-pill border border-line-strong bg-surface-2 px-4 py-2 focus-within:border-gold focus-within:ring-3 focus-within:ring-gold/15 sm:flex"
          >
            <Icon name="search" className="size-[18px] shrink-0 text-muted" />
            <label htmlFor="global-search" className="sr-only">
              Search cardholders by name, ID, phone, or card
            </label>
            <input
              id="global-search"
              name="q"
              type="search"
              enterKeyHint="search"
              placeholder="Search cardholders — name, ID, phone, card…"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
            />
          </form>
        ) : null}
      </div>

      {/* Right: notifications + profile */}
      <div className="flex items-center gap-1 sm:gap-2">
        <NotificationsMenu />
        <ProfileMenu user={user} />
      </div>
    </header>
  );
}
