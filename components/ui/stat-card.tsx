import type { ReactNode } from "react";

/**
 * KPI / stat card — Bhojan Tricolour `.card` (theme.md §6.2). A warm card with
 * an optional gradient accent, a tinted icon badge top-right, a big tabular
 * value, and a muted footnote.
 *
 * Variants map to the mockup's accent classes:
 *  - `saffron` (alias `gold`) — saffron gradient, gold-deep value
 *  - `green`   (alias `sage`) — green gradient, sage-deep value
 *  - `navy`                   — plain card, navy icon + value
 *  - `plain`                  — plain card, muted icon, ink value
 */
type StatVariant = "saffron" | "green" | "navy" | "plain" | "gold" | "sage";

/** Legacy `accent` values kept in the signature so existing callers compile. */
type LegacyAccent = "sage" | "gold" | "tomato" | "ink";

function resolve(variant: StatVariant): "saffron" | "green" | "navy" | "plain" {
  if (variant === "gold") return "saffron";
  if (variant === "sage") return "green";
  return variant;
}

const CARD: Record<"saffron" | "green" | "navy" | "plain", string> = {
  saffron: "bg-[linear-gradient(160deg,var(--gold-soft)_0%,var(--surface)_70%)] border-gold-soft-2",
  green: "bg-[linear-gradient(160deg,var(--sage-soft)_0%,var(--surface)_70%)] border-sage-soft-2",
  navy: "bg-surface border-line",
  plain: "bg-surface border-line",
};
const ICO: Record<"saffron" | "green" | "navy" | "plain", string> = {
  saffron: "bg-gold-soft-2 text-gold-deep",
  green: "bg-sage-soft-2 text-sage-deep",
  navy: "bg-navy-soft text-navy-text",
  plain: "bg-surface-2 text-muted",
};
const VAL: Record<"saffron" | "green" | "navy" | "plain", string> = {
  saffron: "text-gold-deep",
  green: "text-sage-deep",
  navy: "text-navy-text",
  plain: "text-ink",
};
/** Accent the decorative sparkline borrows (via currentColor) per variant. */
const CHART: Record<"saffron" | "green" | "navy" | "plain", string> = {
  saffron: "text-gold",
  green: "text-sage-deep",
  navy: "text-navy-text",
  plain: "text-muted-2",
};

/**
 * Static, decorative bar sparkline tucked beside the value. Purely cosmetic
 * (aria-hidden) — it does NOT represent data; it fades from the variant accent
 * (top) to translucent (bottom) like the theme's soft depth.
 */
const SPARK = [46, 64, 40, 78, 56, 90, 70];
function MiniBars({ className }: { className?: string }) {
  return (
    <div className={`flex h-10 shrink-0 items-end gap-[3px] ${className ?? ""}`} aria-hidden>
      {SPARK.map((h, i) => (
        <span
          key={i}
          className="w-1.5 rounded-t-[2px]"
          style={{
            height: `${h}%`,
            background:
              "linear-gradient(to top, color-mix(in srgb, currentColor 16%, transparent), currentColor)",
          }}
        />
      ))}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  variant = "plain",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  variant?: StatVariant;
  icon?: ReactNode;
  /** @deprecated icon tint now derives from `variant`. Accepted for back-compat. */
  accent?: LegacyAccent;
}) {
  const v = resolve(variant);
  return (
    <div
      className={`@container relative flex flex-col overflow-hidden rounded-md border px-[19px] py-[18px] shadow-sm ${CARD[v]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
          {label}
        </span>
        {icon ? (
          <span
            className={`inline-flex size-[34px] shrink-0 items-center justify-center rounded-sm [&_svg]:size-[17px] ${ICO[v]}`}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-3.5 flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Font scales with the card's own width (container query) so long ₹ values
              fit on narrow grids, capping at the mockup's 28px on wide cards. */}
          <p
            className={`font-display text-[clamp(1.05rem,8.5cqi,1.7rem)] font-bold leading-[1.1] tracking-[-0.04em] tabular-nums ${VAL[v]}`}
          >
            {value}
          </p>
          {hint ? <p className="mt-[7px] text-[11.5px] text-muted-2">{hint}</p> : null}
        </div>
        {/* Decorative only — hidden on very narrow cards so it never crowds the value. */}
        <MiniBars className={`hidden @[180px]:flex ${CHART[v]}`} />
      </div>
    </div>
  );
}
