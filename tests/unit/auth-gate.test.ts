import { describe, it, expect } from "vitest";
import { authConfig } from "@/lib/auth.config";

/**
 * Edge auth gate (`proxy.ts` → authConfig.authorized) — the allowlist that
 * decides which paths an unauthenticated request may reach. Covers: public
 * prefixes, the root, cron-invoked self-auth API routes (which 401 inside the
 * route, not at the edge — a cron caller has no session to redirect), and
 * deny-by-default for everything else.
 */

const authorized = authConfig.callbacks.authorized;

function gate(pathname: string, signedIn = false): boolean {
  return authorized({
    auth: signedIn ? ({ user: { id: "1" } } as never) : null,
    request: { nextUrl: { pathname } } as never,
  }) as boolean;
}

describe("edge auth gate", () => {
  it("lets public prefixes through unauthenticated", () => {
    for (const p of ["/", "/login", "/top-up", "/api/auth/session", "/api/public/balance", "/api/health"]) {
      expect(gate(p), p).toBe(true);
    }
  });

  it("lets cron self-auth routes through unauthenticated (they 401 themselves)", () => {
    expect(gate("/api/payments/reconcile")).toBe(true);
    expect(gate("/api/notifications/digest")).toBe(true);
  });

  it("does not open other /api/payments or /api/notifications paths", () => {
    expect(gate("/api/payments/anything-else")).toBe(false);
    expect(gate("/api/notifications/digest/sub")).toBe(false);
  });

  it("denies protected paths without a session, allows with one", () => {
    for (const p of ["/dashboard", "/counter", "/api/counter/tap", "/recharge"]) {
      expect(gate(p), p).toBe(false);
      expect(gate(p, true), p).toBe(true);
    }
  });
});
