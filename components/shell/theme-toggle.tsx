"use client";

import { useCallback, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const THEME_EVENT = "themechange";

function getTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

/**
 * Toggles `data-theme` on <html> and persists the choice. The initial theme is
 * applied pre-paint by the inline script in app/layout.tsx; here we read it via
 * useSyncExternalStore (no setState-in-effect, no hydration mismatch) and flip it.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribe, getTheme, () => "light");

  const toggle = useCallback(() => {
    const next: Theme = getTheme() === "dark" ? "light" : "dark";
    if (next === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="rounded-sm border border-line-strong bg-surface-2 px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:border-gold hover:text-gold-deep focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
    >
      {theme === "dark" ? "☀ Light" : "☾ Dark"}
    </button>
  );
}
