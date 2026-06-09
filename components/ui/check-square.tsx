/**
 * Small square checkbox visual (Warm Cafeteria) for custom option lists where a
 * native checkbox can't be styled — multi-selects, option rows, etc. Decorative:
 * the parent control owns the real role/aria state.
 */
export function CheckSquare({
  checked,
  indeterminate = false,
}: {
  checked: boolean;
  indeterminate?: boolean;
}) {
  const active = checked || indeterminate;
  return (
    <span
      aria-hidden="true"
      className={`grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors ${
        active ? "border-gold-deep bg-gold text-ink" : "border-line-strong bg-surface"
      }`}
    >
      {indeterminate ? (
        <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round">
          <path d="M6 12h12" />
        </svg>
      ) : checked ? (
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      ) : null}
    </span>
  );
}
