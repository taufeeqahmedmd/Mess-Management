"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Layout effect on the client, plain effect on the server (avoids SSR warning). */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const format = (n: number, decimals: number) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);

/**
 * Animated count-up for KPI values. Renders the final value on the server (so
 * there's no layout shift and it degrades without JS), then on mount eases from
 * 0 → value. Honours `prefers-reduced-motion` by skipping the animation.
 *
 * Display only — never used for money math. Pass `Decimal.toNumber()` for ₹.
 */
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  durationMs = 2000,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number | null>(null);

  useIsoLayoutEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || durationMs <= 0 || value === 0) {
      setDisplay(value);
      return;
    }

    // Set 0 before paint so the final value never flashes, then ease up.
    setDisplay(0);
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(p < 1 ? value * eased : value);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return (
    <span className="tabular-nums">
      {prefix}
      {format(display, decimals)}
      {suffix}
    </span>
  );
}
