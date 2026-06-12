/**
 * Shared control style strings for the Bhojan Tricolour list/report pages.
 * Keeping these in one place means every toolbar button, search box, and inline
 * row action reads identically across Recharge, Cards, Users, Reports, etc.
 *
 * Note: primary/search buttons use `text-ink` on gold (not white) — saffron is
 * too light for AA-contrast white text at these sizes (theme.md §8).
 */

/** Ghost toolbar button (Import, Export, Run sweep…). Pair with a leading icon. */
export const BTN_GHOST =
  "inline-flex items-center gap-2 rounded-sm border border-line-strong bg-surface px-[18px] py-[9px] text-[13px] font-semibold text-ink transition-colors hover:border-gold-soft-2 hover:bg-gold-soft hover:text-gold-deep focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20 disabled:opacity-60";

/** Solid saffron primary button (Add, Save, Apply, Search). */
export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-sm bg-gold px-5 py-[9px] text-[13px] font-semibold text-white shadow-gold transition-colors hover:bg-gold-deep focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/30 disabled:opacity-60";

/** Find-a-row search input inside a `.find-card` panel. */
export const INPUT_FIND =
  "w-full rounded-sm border border-line-strong bg-surface px-3.5 py-2.5 text-[13px] text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";

/** Inline row-action link buttons. */
export const LINK_ACT_GOLD =
  "rounded-sm px-2 py-1 text-[12.5px] font-semibold text-gold-deep transition-colors hover:bg-gold-soft focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";
export const LINK_ACT_DANGER =
  "rounded-sm px-2 py-1 text-[12.5px] font-semibold text-tomato transition-colors hover:bg-tomato-soft focus:outline-none focus-visible:ring-3 focus-visible:ring-tomato/20 disabled:opacity-60";
export const LINK_ACT_SAGE =
  "rounded-sm px-2 py-1 text-[12.5px] font-semibold text-sage-deep transition-colors hover:bg-sage-soft focus:outline-none focus-visible:ring-3 focus-visible:ring-sage/20 disabled:opacity-60";

/** Card/panel shells. */
export const PANEL = "rounded-md border border-line bg-surface shadow-sm";
export const FIND_CARD = "flex flex-col gap-2.5 rounded-md border border-line bg-surface p-[18px_20px] shadow-sm sm:flex-row";

/** Table header / body cell base classes (Bhojan Tricolour density). */
export const TH = "px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-2";
export const TD = "px-5 py-3.5 text-[13.5px]";

/** Drawer/page form field styles (uppercase label + soft input). */
export const FORM_LABEL = "mb-2 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-2";
export const FORM_INPUT =
  "w-full rounded-sm border border-line-strong bg-surface px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-muted-2 focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20";
export const FORM_OPT = "font-medium normal-case tracking-normal text-muted-2";

/** Allowed rows-per-page values + a server-safe clamp for the `size` param. */
export const PAGE_SIZES = [10, 25, 50];
export function clampPageSize(raw: string | undefined, fallback = 25): number {
  const n = Number.parseInt(raw ?? "", 10);
  return PAGE_SIZES.includes(n) ? n : fallback;
}
