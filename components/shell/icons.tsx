import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "menu"
  | "search"
  | "bell"
  | "user"
  | "chevronDown"
  | "login"
  | "logout"
  | "sun"
  | "moon"
  | "dashboard"
  | "counter"
  | "recharge"
  | "users"
  | "card"
  | "reports"
  | "vendor"
  | "cart"
  | "bag"
  | "settings"
  | "shield";

const ICONS: Record<IconName, ReactNode> = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  login: (
    <>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="m10 17 5-5-5-5" />
      <path d="M15 12H3" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  counter: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  recharge: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
      <path d="M21 11h-4a2 2 0 0 0 0 4h4z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6" />
      <path d="M21.5 20a6.5 6.5 0 0 0-4.5-6.2" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19M6 15h4" />
    </>
  ),
  reports: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 16v-5M12 16V8M17 16v-3" />
    </>
  ),
  vendor: (
    <>
      <path d="M4 9h16l-1-4H5z" />
      <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
      <path d="M9 20v-5h6v5" />
    </>
  ),
  cart: (
    <>
      <path d="M3 2h13l-1 9H4L3 2Z" />
      <path d="M4 11l-1 7h13" />
      <circle cx="7" cy="21" r="1" />
      <circle cx="15" cy="21" r="1" />
    </>
  ),
  bag: (
    <>
      <path d="M5 7h14l-1 11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7Z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.87 1.2V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-2.87-1.2l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.06a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.06a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

/**
 * Ashoka Chakra brand mark — 24 navy spokes (stroked via the `.chakra` class in
 * globals.css). Used in the app-shell sidebar brand block and the auth screens.
 */
const CHAKRA_SPOKES = Array.from({ length: 24 }, (_, i) => {
  const a = (i * 15 * Math.PI) / 180;
  const inner = 8;
  const outer = 44;
  return {
    x1: 50 + inner * Math.cos(a),
    y1: 50 + inner * Math.sin(a),
    x2: 50 + outer * Math.cos(a),
    y2: 50 + outer * Math.sin(a),
  };
});

export function Chakra({ className }: { className?: string }) {
  return (
    <svg className={`chakra ${className ?? ""}`} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" strokeWidth={3} />
      <circle cx="50" cy="50" r="7" fill="none" strokeWidth={3} />
      <g strokeWidth={2}>
        {CHAKRA_SPOKES.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
        ))}
      </g>
    </svg>
  );
}

/**
 * Brand logo image. Replaces the Chakra mark across the app. The asset is not
 * square (458×363), so size it by HEIGHT — callers pass an `h-*` class and the
 * width follows the intrinsic ratio via `w-auto` (no distortion).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, no layout-shift concern */}
      <img src="/assets/images/logo/logo.svg" alt="" className={`w-auto dark:hidden ${className ?? ""}`} />
      {/* White variant for dark mode ([data-theme="dark"]). */}
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, no layout-shift concern */}
      <img src="/assets/images/logo/logo-white.png" alt="" className={`hidden w-auto dark:block ${className ?? ""}`} />
    </>
  );
}

export function Icon({
  name,
  className,
  ...props
}: { name: IconName; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      {ICONS[name]}
    </svg>
  );
}
