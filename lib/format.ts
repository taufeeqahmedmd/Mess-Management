import { Prisma } from "@prisma/client";

/**
 * Display-only money formatting (en-IN grouping). All arithmetic happens in
 * `Decimal` upstream — this is the render boundary, so a lossy `toNumber()` for
 * presentation is fine. Never feed this back into a calculation.
 */
export function inr(value: Prisma.Decimal | number | string): string {
  const n =
    value instanceof Prisma.Decimal ? value.toNumber() : typeof value === "string" ? Number(value) : value;
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
