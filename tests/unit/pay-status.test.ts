import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * GET /api/public/pay/status — what the return page polls while waiting for
 * Jodo's webhook. Must read only our DB, validate the ref strictly, leak no
 * PII, and rate-limit per ref (a campus NAT can share one IP).
 */

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { paymentOrder: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

import { GET } from "@/app/api/public/pay/status/route";
import { __resetRateLimits } from "@/lib/rate-limit";

const REF = "11111111-1111-4111-8111-111111111111";
const get = (ref: string, ip = "203.0.113.5") =>
  GET(new Request(`http://app.test/api/public/pay/status?ref=${encodeURIComponent(ref)}`, { headers: { "x-forwarded-for": ip } }));

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
});

describe("GET /api/public/pay/status", () => {
  it("400s a malformed ref without touching the DB", async () => {
    expect((await get("not-a-uuid")).status).toBe(400);
    expect((await get("")).status).toBe(400);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("404s an unknown ref", async () => {
    findUnique.mockResolvedValue(null);
    expect((await get(REF)).status).toBe(404);
  });

  it.each([
    ["pending", "pending"],
    ["credited", "credited"],
    ["failed", "failed"],
  ])("maps order status %s → %s and returns nothing else", async (db, out) => {
    findUnique.mockResolvedValue({ status: db });
    const res = await get(REF);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: out });
    expect(findUnique).toHaveBeenCalledWith({ where: { clientUuid: REF }, select: { status: true } });
  });

  it("rate-limits a single ref after 90 polls in a minute", async () => {
    findUnique.mockResolvedValue({ status: "pending" });
    for (let i = 0; i < 90; i++) expect((await get(REF)).status).toBe(200);
    const res = await get(REF);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
  });
});
