import { describe, it, expect } from "vitest";
import { readClientUuid, deterministicUuid } from "@/lib/idempotency";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("readClientUuid", () => {
  it("passes a valid client token through unchanged (so a resubmit collides)", () => {
    const fd = new FormData();
    const uuid = "11111111-2222-4333-8444-555555555555";
    fd.set("clientTxId", uuid);
    expect(readClientUuid(fd)).toBe(uuid);
  });

  it("falls back to a fresh UUID when the token is missing or malformed", () => {
    const fd = new FormData();
    expect(readClientUuid(fd)).toMatch(UUID_RE);
    fd.set("clientTxId", "not-a-uuid");
    expect(readClientUuid(fd)).toMatch(UUID_RE);
  });
});

describe("deterministicUuid", () => {
  it("is stable for the same seed and distinct for different seeds", () => {
    expect(deterministicUuid("row:a")).toBe(deterministicUuid("row:a"));
    expect(deterministicUuid("row:a")).not.toBe(deterministicUuid("row:b"));
  });

  it("produces a v5-shaped RFC-4122 UUID", () => {
    const u = deterministicUuid("recharge-import:EMP1:100::2026-12-31:2");
    expect(u).toMatch(UUID_RE);
    expect(u[14]).toBe("5"); // version nibble
    expect(["8", "9", "a", "b"]).toContain(u[19].toLowerCase()); // RFC variant
  });
});
