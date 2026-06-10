import type { ReactNode } from "react";

type StatVariant = "sage" | "gold" | "plain";
type Accent = "sage" | "gold" | "tomato" | "ink";

const VARIANTS: Record<StatVariant, string> = {
  sage: "bg-sage-soft text-sage-deep",
  gold: "bg-gold-soft text-gold-deep",
  plain: "bg-surface-2 text-ink border border-line",
};

const ACCENTS: Record<Accent, string> = {
  sage: "bg-sage/20 text-sage-deep",
  gold: "bg-gold/25 text-gold-deep",
  tomato: "bg-tomato-soft text-tomato",
  ink: "bg-ink/10 text-ink-2",
};

const DEFAULT_ACCENT: Record<StatVariant, Accent> = { sage: "sage", gold: "gold", plain: "ink" };

/**
 * KPI / stat card (theme.md §6.2). Big Fraunces value, muted label, optional
 * modern icon badge in the top-right.
 */
export function StatCard({
  label,
  value,
  hint,
  variant = "plain",
  icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  variant?: StatVariant;
  icon?: ReactNode;
  /** Icon-badge tint; defaults from the variant. */
  accent?: Accent;
}) {
  return (
    <div className={`@container flex flex-col rounded-xl p-5 shadow-sm ${VARIANTS[variant]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon ? (
          <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${ACCENTS[accent ?? DEFAULT_ACCENT[variant]]}`}>
            {icon}
          </span>
        ) : null}
      </div>
      {/* Font scales with the card's own width (container query) so long ₹ values
          fit whether the card is 100px on a laptop grid or 180px on a tablet. */}
      <p className="mt-3 font-display text-[clamp(0.9rem,11cqi,1.75rem)] font-semibold leading-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-2 text-xs text-ink-2">{hint}</p> : null}
    </div>
  );
}
