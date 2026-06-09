import { z } from "zod";

/**
 * Shared rate-matrix validation (settings/rates). Used at the server boundary in
 * counter-rate-actions.ts and re-usable on the client form — the same schema both
 * sides (CLAUDE.md: "Validate at the boundary with Zod; reuse the same schema
 * client + server"). Rates resolve at tap time → money, so the server is always
 * the final authority even if the client already validated.
 */

/** Money as a string with up to 2 decimals (never float). Trimmed before checks. */
export const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Amounts must be numbers with at most 2 decimals.");

/** One incoming row from the rates editor (counter(s) + meal + per-category cells). */
export const rateRowSchema = z.object({
  counterIds: z.array(z.string()).optional(),
  mealId: z.string().optional(),
  cells: z
    .record(
      z.string(),
      z.object({ charge: z.string().optional(), vendor: z.string().optional() }),
    )
    .optional(),
});

export const rateRowsSchema = z.array(rateRowSchema);

export type RateRow = z.infer<typeof rateRowSchema>;

/** True when a money string is well-formed (≥0, ≤2 decimals). */
export function isMoney(value: string): boolean {
  return moneyString.safeParse(value).success;
}
