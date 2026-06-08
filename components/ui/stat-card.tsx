import type { ReactNode } from "react";

type StatVariant = "sage" | "gold" | "plain";

const VARIANTS: Record<StatVariant, string> = {
  sage: "bg-sage-soft text-sage-deep",
  gold: "bg-gold-soft text-gold-deep",
  plain: "bg-surface-2 text-ink border border-line",
};

/**
 * KPI / stat card (theme.md §6.2). Big Fraunces value, muted label.
 */
export function StatCard({
  label,
  value,
  hint,
  variant = "plain",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  variant?: StatVariant;
}) {
  return (
    <div className={`rounded-md p-5 shadow-sm ${VARIANTS[variant]}`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 font-display text-[28px] font-semibold leading-none">
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs text-ink-2">{hint}</p> : null}
    </div>
  );
}
