"use client";

import { useSyncExternalStore } from "react";
import { Icon, type IconName } from "./icons";

/**
 * Two-state Light/Dark appearance toggle shown in the profile dropdown. The
 * choice is persisted in localStorage under `theme` and applied by flipping
 * `[data-theme="dark"]` on <html> — matching the pre-paint init script in
 * `app/layout.tsx`. Defaults to Light when no choice has been made.
 *
 * Backed by `useSyncExternalStore`: the server snapshot is always "light" (no
 * hydration mismatch), and after hydration the real persisted value is read —
 * without a setState-in-effect (which the React Compiler lint flags).
 */
type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

const OPTIONS: { value: Theme; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function getServerSnapshot(): Theme {
  return "light";
}

function applyTheme(theme: Theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function ThemeControl() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function select(next: Theme) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore — still apply for this session */
    }
    applyTheme(next);
    listeners.forEach((l) => l());
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex items-center gap-1 rounded-pill bg-canvas p-1"
    >
      {OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => select(opt.value)}
            className={
              "flex flex-1 items-center justify-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20 " +
              (active
                ? "bg-gold-soft text-gold-deep shadow-sm"
                : "text-ink-2 hover:bg-gold/10")
            }
          >
            <Icon name={opt.icon} className="size-4" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
