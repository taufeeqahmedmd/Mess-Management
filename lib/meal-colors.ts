/**
 * Stable per-meal colour palette. A meal's colour is its position in creation
 * order (meals ordered by id), so the same meal keeps the same colour
 * everywhere it's charted (consumption "Taps by meal", balance "Coupons by
 * meal", cardholder coupon tiles, dashboard meal breakdowns). Adding a new meal
 * auto-assigns it the next colour in the palette.
 *
 * Colours are CSS custom-property references so they track light/dark themes.
 * Build the id→colour map server-side with `mealColorMap()` in services/reporting
 * and pass it down; never colour by a chart's local slice index.
 */
export const MEAL_PALETTE = [
  "var(--gold)",
  "var(--sage)",
  "var(--navy)",
  "var(--gold-deep)",
  "var(--sage-deep)",
  "var(--terracotta)",
  "var(--tomato)",
  "var(--navy-deep)",
];

/** Colour for the meal at creation-order index `i` (wraps past the palette). */
export function mealColorAt(i: number): string {
  const n = MEAL_PALETTE.length;
  return MEAL_PALETTE[((i % n) + n) % n];
}

/** A soft, surface-tinted version of a meal colour for card/tile backgrounds. */
export function mealTint(color: string): string {
  return `color-mix(in srgb, ${color} 13%, var(--surface))`;
}
