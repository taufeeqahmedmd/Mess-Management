import { describe, expect, it } from "vitest";
import { resolvePeriod, parseDay } from "@/services/settlement";

describe("parseDay", () => {
  it("parses YYYY-MM-DD to local midnight", () => {
    const d = parseDay("2026-06-15");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(5);
    expect(d?.getDate()).toBe(15);
    expect(d?.getHours()).toBe(0);
  });
  it("rejects junk", () => {
    expect(parseDay("")).toBeNull();
    expect(parseDay("nope")).toBeNull();
    expect(parseDay("2026-13-40")).toBeNull();
  });
});

describe("resolvePeriod", () => {
  it("accepts a valid inclusive period and exposes an exclusive upper bound", () => {
    const r = resolvePeriod("2026-06-01", "2026-06-30");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.period.start.getDate()).toBe(1);
      expect(r.period.end.getDate()).toBe(30);
      // exclusive bound is the day after `end` → July 1
      expect(r.period.toExclusive.getMonth()).toBe(6);
      expect(r.period.toExclusive.getDate()).toBe(1);
    }
  });

  it("allows a single-day period", () => {
    const r = resolvePeriod("2026-06-09", "2026-06-09");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.period.toExclusive.getDate()).toBe(10);
  });

  it("rejects a reversed period", () => {
    const r = resolvePeriod("2026-06-30", "2026-06-01");
    expect(r.ok).toBe(false);
  });

  it("rejects missing/invalid dates", () => {
    expect(resolvePeriod(undefined, "2026-06-01").ok).toBe(false);
    expect(resolvePeriod("2026-06-01", "bad").ok).toBe(false);
  });
});
