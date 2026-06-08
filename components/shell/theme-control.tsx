"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";

/**
 * Two-state Light/Dark appearance toggle shown in the profile dropdown. The
 * choice is persisted in localStorage under `theme` and applied by flipping
 * `[data-theme="dark"]` on <html> — matching the pre-paint init script in
 * `app/layout.tsx`. Defaults to Light when no choice has been made.
 */
type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

const OPTIONS: { value: Theme; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

function applyTheme(theme: Theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>("light");

  // Read the persisted choice after mount (avoids a hydration mismatch; the
  // inline script has already applied it to the DOM before paint).
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* localStorage unavailable — fall back to the default */
    }
    setTheme(stored === "dark" ? "dark" : "light");
  }, []);

  function select(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore — still apply for this session */
    }
    applyTheme(next);
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
