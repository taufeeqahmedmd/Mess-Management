"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * SSR-safe media query (assumes desktop on the server). Used to route the
 * navbar's menu button: collapse the rail on desktop, open the drawer on mobile.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = () =>
    typeof window === "undefined" ? true : window.matchMedia(query).matches;

  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

/** Calls `onClose` on outside pointer-down or Escape, while `active`. */
export function useDismiss<T extends HTMLElement>(
  active: boolean,
  onClose: () => void,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;

    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, onClose]);

  return ref;
}
