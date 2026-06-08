import { describe, expect, it, beforeEach } from "vitest";
import { rateLimit, __resetRateLimits } from "@/lib/rate-limit";
import { publicCodeSchema } from "@/lib/public-schema";

describe("rateLimit", () => {
  beforeEach(() => __resetRateLimits());

  it("allows up to the limit within a window, then blocks", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("ip-a", 3, 60_000, t0).ok).toBe(true);
    }
    const blocked = rateLimit("ip-a", 3, 60_000, t0);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const t0 = 2_000_000;
    expect(rateLimit("ip-b", 1, 60_000, t0).ok).toBe(true);
    expect(rateLimit("ip-b", 1, 60_000, t0).ok).toBe(false);
    expect(rateLimit("ip-b", 1, 60_000, t0 + 60_001).ok).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const t0 = 3_000_000;
    expect(rateLimit("ip-c", 1, 60_000, t0).ok).toBe(true);
    expect(rateLimit("ip-d", 1, 60_000, t0).ok).toBe(true); // different IP, fresh budget
    expect(rateLimit("ip-c", 1, 60_000, t0).ok).toBe(false);
  });
});

describe("publicCodeSchema", () => {
  it("accepts real handles", () => {
    for (const c of ["EMP1001", "ADM2024001", "KIAD0088", "stu_01", "a/b-1"]) {
      expect(publicCodeSchema.safeParse(c).success).toBe(true);
    }
  });

  it("trims surrounding whitespace", () => {
    const r = publicCodeSchema.safeParse("  EMP1001  ");
    expect(r.success && r.data).toBe("EMP1001");
  });

  it("rejects empty, oversized, and injection-ish input", () => {
    expect(publicCodeSchema.safeParse("").success).toBe(false);
    expect(publicCodeSchema.safeParse("x".repeat(41)).success).toBe(false);
    expect(publicCodeSchema.safeParse("a' OR 1=1--").success).toBe(false);
    expect(publicCodeSchema.safeParse("<script>").success).toBe(false);
    expect(publicCodeSchema.safeParse("a b").success).toBe(false);
  });
});
