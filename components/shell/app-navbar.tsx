"use client";

import { Icon } from "./icons";
import { NotificationsMenu } from "./notifications-menu";
import { ProfileMenu } from "./profile-menu";
import { ThemeToggleButton } from "./theme-control";
import type { ShellUser } from "./app-shell";

/**
 * Topbar (Bhojan Tricolour): a menu button (collapses the rail / opens the
 * mobile drawer), a centered pill search, then the appearance toggle,
 * notifications, and profile. Brand lives in the sidebar. Sticky to the top of
 * the content column. The search submits to the global results page
 * (/search?q=…), spanning cardholders, staff, counters, and vendors — each
 * group permission-gated and branch-scoped. Only shown to staff who can search
 * at least one entity; hidden on phones (the rail links are one tap).
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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md sm:px-7">
      {/* Left: menu toggle (collapse rail on desktop, drawer on mobile) */}
      <button
        type="button"
        aria-label="Toggle navigation menu"
        onClick={onMenuClick}
        className="grid size-10 shrink-0 place-items-center rounded-pill text-ink-2 transition-colors hover:bg-gold-soft hover:text-gold-deep focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
      >
        <Icon name="menu" className="size-[22px]" />
      </button>

      {/* Center: search → global directory. Hidden on phones; the flex-1
          spacer keeps the right cluster pinned even when the form isn't shown. */}
      <div className="flex min-w-0 flex-1 justify-center">
        {canSearch ? (
          <form
            role="search"
            method="get"
            action="/search"
            className="hidden w-full max-w-xl items-center gap-2 rounded-pill border border-line-strong bg-surface px-4 py-2.5 focus-within:border-gold focus-within:ring-3 focus-within:ring-gold/15 sm:flex"
          >
            <Icon name="search" className="size-[18px] shrink-0 text-muted" />
            <label htmlFor="global-search" className="sr-only">
              Search cardholders, staff, counters, and vendors
            </label>
            <input
              id="global-search"
              name="q"
              type="search"
              enterKeyHint="search"
              placeholder="Search cardholders, staff, counters, vendors…"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
            />
          </form>
        ) : null}
      </div>

      {/* Right: appearance toggle + notifications + profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggleButton />
        <NotificationsMenu />
        <ProfileMenu user={user} />
      </div>
    </header>
  );
}
