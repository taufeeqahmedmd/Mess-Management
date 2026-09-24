/** Normalize a stored/typed Indian phone to a bare 10-digit string, or null. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2); // +91XXXXXXXXXX
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1); // 0XXXXXXXXXX
  return /^\d{10}$/.test(d) ? d : null;
}

/**
 * Strict email shape, shared by cardholder create/edit, CSV import, the public
 * top-up form, and the Jodo payment payload. The domain must end in an
 * alphabetic TLD of 2+ letters, so a phone number glued onto the end
 * ("x@gmail.com0744318010") is rejected — the loose "anything@anything.anything"
 * pattern used before let exactly that through to the payment gateway.
 */
export const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

export function isValidEmail(raw: string | null | undefined): boolean {
  const e = (raw ?? "").trim();
  return e.length > 0 && e.length <= 150 && EMAIL_RE.test(e);
}

/** Return a trimmed valid email, or null. A stored value that fails the strict
 *  check is treated as "no email on file" so callers ask for a fresh one. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim();
  return isValidEmail(e) ? e : null;
}
