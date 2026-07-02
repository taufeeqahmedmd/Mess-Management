/** Normalize a stored/typed Indian phone to a bare 10-digit string, or null. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2); // +91XXXXXXXXXX
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1); // 0XXXXXXXXXX
  return /^\d{10}$/.test(d) ? d : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Return a trimmed valid email, or null. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim();
  return EMAIL.test(e) ? e : null;
}
