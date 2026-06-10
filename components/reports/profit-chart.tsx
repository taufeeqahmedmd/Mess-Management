"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type ChartPoint = { date: string; label: string; profit: number };

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function shortInr(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}k`;
  return `${sign}₹${Math.round(a)}`;
}

function fmtDate(date: string): string {
  const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (md) return new Date(+md[1], +md[2] - 1, +md[3]).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const mm = /^(\d{4})-(\d{2})$/.exec(date);
  if (mm) return new Date(+mm[1], +mm[2] - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  return date;
}

/** Catmull-Rom → cubic bézier for a smooth line through the points. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/**
 * Profit-over-time chart. Modern gradient area + smooth line, animated draw on
 * mount, hover crosshair + tooltip. Responsive: an internal ResizeObserver
 * renders the SVG at the container's real pixel size so geometry == screen
 * coords (tooltips line up exactly). Data respects the dashboard's date filter.
 */
export function ProfitChart({ points, rangeLabel }: { points: ChartPoint[]; rangeLabel: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const [size, setSize] = useState({ w: 600, h: 260 });
  const [hover, setHover] = useState<number | null>(null);

  // Measure the plot box itself (clientWidth/Height = the real laid-out size).
  // useLayoutEffect runs before paint so the first visible frame already has the
  // correct width — the SVG fills the card instead of sitting at a stale default.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Fallback for environments/orientation changes where RO doesn't fire (e.g.
    // iOS rotate) — keeps the SVG filling its container.
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  useEffect(() => {
    const p = lineRef.current;
    if (!p) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const len = p.getTotalLength();
    p.style.strokeDasharray = String(len);
    p.style.strokeDashoffset = String(len);
    p.getBoundingClientRect(); // reflow
    p.style.transition = "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)";
    p.style.strokeDashoffset = "0";
  }, [points, size.w, size.h]);

  const total = points.reduce((s, p) => s + p.profit, 0);

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Profit trend</h2>
          <p className="mt-0.5 text-xs text-muted">{rangeLabel}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-semibold leading-none text-gold-deep">{inr(total)}</p>
          <p className="mt-1 text-[11px] text-muted">total in range</p>
        </div>
      </div>
      {children}
    </div>
  );

  if (points.length === 0) {
    return (
      <Card>
        <div className="flex flex-1 items-center justify-center py-10 text-sm text-ink-2">No profit data in this range.</div>
      </Card>
    );
  }

  // Fallbacks so the chart always renders even if a measurement returns 0 (some
  // grid/flex layouts report 0 width on the first frame). useLayoutEffect then
  // corrects to the real size before paint; RO/resize keep it in sync.
  const W = size.w || 600;
  const H = size.h || 260;
  const padL = 12, padR = 12, padT = 16, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const profits = points.map((p) => p.profit);
  let min = Math.min(0, ...profits);
  let max = Math.max(0, ...profits);
  if (max === min) max += 1;

  const n = points.length;
  const xAt = (i: number) => (n === 1 ? padL + plotW / 2 : padL + (plotW * i) / (n - 1));
  const yAt = (v: number) => padT + plotH * (1 - (v - min) / (max - min));
  const zeroY = yAt(0);
  const pts = points.map((p, i) => ({ x: xAt(i), y: yAt(p.profit) }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[n - 1].x.toFixed(2)} ${zeroY.toFixed(2)} L ${pts[0].x.toFixed(2)} ${zeroY.toFixed(2)} Z`;

  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks);
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  const pickAt = (clientX: number, rect: DOMRect) => {
    const mx = clientX - rect.left;
    const i = n === 1 ? 0 : Math.round(((mx - padL) / plotW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => pickAt(e.clientX, e.currentTarget.getBoundingClientRect());
  // Touch (iOS/Android): tap or drag along the chart to read values; pan-y keeps
  // vertical page scroll working.
  const onTouch = (e: React.TouchEvent<SVGSVGElement>) => {
    const t = e.touches[0];
    if (t) pickAt(t.clientX, e.currentTarget.getBoundingClientRect());
  };

  const hp = hover != null ? { ...pts[hover], data: points[hover] } : null;

  return (
    <Card>
      <div ref={wrapRef} className="relative mt-4 min-h-[220px] flex-1">
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Profit over time"
          className="block select-none"
          style={{ touchAction: "pan-y" }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onTouchStart={onTouch}
          onTouchMove={onTouch}
          onTouchEnd={() => setHover(null)}
        >
          <defs>
            <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.38" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* gridlines + value labels */}
          {grid.map((v, i) => {
            const gy = yAt(v);
            return (
              <g key={i}>
                <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <text x={W - padR} y={gy - 3} textAnchor="end" className="fill-muted" style={{ fontSize: 10 }}>
                  {shortInr(v)}
                </text>
              </g>
            );
          })}

          {/* zero baseline emphasised when the range crosses it */}
          {min < 0 && max > 0 ? (
            <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--line-strong)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          ) : null}

          <path d={area} fill="url(#profitFill)" />
          <path ref={lineRef} d={line} fill="none" stroke="var(--gold-deep)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

          {/* point dots */}
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 4.5 : 2} fill="var(--gold-deep)" className="transition-[r]" />
          ))}

          {/* x labels */}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" className="fill-muted" style={{ fontSize: 10 }}>
                {p.label}
              </text>
            ) : null,
          )}

          {/* hover crosshair */}
          {hp ? (
            <g>
              <line x1={hp.x} y1={padT} x2={hp.x} y2={H - padB} stroke="var(--gold-deep)" strokeWidth={1} strokeOpacity={0.4} vectorEffect="non-scaling-stroke" />
              <circle cx={hp.x} cy={hp.y} r={5} fill="var(--surface)" stroke="var(--gold-deep)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            </g>
          ) : null}
        </svg>

        {hp ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-surface px-2.5 py-1.5 shadow-lg"
            style={{ left: Math.min(Math.max(hp.x, 56), W - 56), top: Math.max(hp.y - 10, 4) }}
          >
            <p className="whitespace-nowrap text-[11px] text-muted">{fmtDate(hp.data.date)}</p>
            <p className="whitespace-nowrap font-mono text-sm font-semibold text-ink">{inr(hp.data.profit)}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
