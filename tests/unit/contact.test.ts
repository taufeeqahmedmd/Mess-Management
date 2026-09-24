import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/contact";

describe("isValidEmail / normalizeEmail", () => {
  it("accepts ordinary addresses", () => {
    for (const e of ["a@b.co", "vinay.yelagala@gmail.com", "First+Tag@sub.example.org", "x_y-z@my-host.in"]) {
      expect(isValidEmail(e), e).toBe(true);
    }
    expect(normalizeEmail("  Vinay@Gmail.com ")).toBe("Vinay@Gmail.com");
  });

  it("rejects an email with a phone number glued onto the domain (the Jodo 400 case)", () => {
    expect(isValidEmail("VINAY.YELAGALA@GMAIL.COM0744318010")).toBe(false);
    expect(normalizeEmail("VINAY.YELAGALA@GMAIL.COM0744318010")).toBeNull();
  });

  it("rejects malformed shapes the old loose regex allowed", () => {
    for (const e of ["a@b", "a@b.", "a@.com", "a@b.c", "a@b.123", "a b@c.com", "a@@b.com", "", "   ", "a@-host.com"]) {
      expect(isValidEmail(e), e).toBe(false);
    }
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("strips +91 / leading 0 and requires 10 digits", () => {
    expect(normalizePhone("+91 91772 08650")).toBe("9177208650");
    expect(normalizePhone("09177208650")).toBe("9177208650");
    expect(normalizePhone("917720865")).toBeNull();
  });
});
