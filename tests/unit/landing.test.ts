import { describe, it, expect } from "vitest";
import { type Actor, type Permission } from "@/lib/rbac";
import { landingFor, exitFromCounter } from "@/lib/landing";

/**
 * Landing / exit routing (`lib/landing`) — where a role lands after login and
 * where the counter's "Exit" goes. Focus: a Mess Incharge (counter + one other
 * page) lands on the counter and exits to that other page; a counter-only
 * operator lands on the counter and has no exit (→ Logout).
 */

function actor(perms: Permission[], over: Partial<Actor> = {}): Actor {
  return { id: "1", isSuperAdmin: false, permissions: new Set(perms), branchId: "1", ...over };
}

describe("landingFor", () => {
  it("sends a Mess Incharge (counter + vendorDashboard) to the counter", () => {
    expect(landingFor(actor(["counter.operate", "vendorDashboard.view"]))).toBe("/counter");
  });

  it("sends a counter-only operator to the counter", () => {
    expect(landingFor(actor(["counter.operate"]))).toBe("/counter");
  });

  it("prefers the dashboard when the actor can view it", () => {
    expect(landingFor(actor(["dashboard.view", "counter.operate"]))).toBe("/dashboard");
  });

  it("routes a Vendor to their orders", () => {
    expect(landingFor(actor(["foodRequests.vendor"]))).toBe("/vendor-orders");
  });

  it("super admin lands on the dashboard", () => {
    expect(landingFor(actor([], { isSuperAdmin: true }))).toBe("/dashboard");
  });

  it("falls back to /account when no module permission matches", () => {
    expect(landingFor(actor([]))).toBe("/account");
  });
});

describe("exitFromCounter", () => {
  it("returns the other accessible page for a Mess Incharge", () => {
    expect(exitFromCounter(actor(["counter.operate", "vendorDashboard.view"]))).toBe("/vendor-dashboard");
  });

  it("follows the actor's real access when reconfigured (e.g. reports instead)", () => {
    expect(exitFromCounter(actor(["counter.operate", "reports.view"]))).toBe("/reports");
  });

  it("is null for a counter-only operator (→ Logout)", () => {
    expect(exitFromCounter(actor(["counter.operate"]))).toBeNull();
  });

  it("never returns the counter itself", () => {
    expect(exitFromCounter(actor(["counter.operate", "dashboard.view"]))).toBe("/dashboard");
  });
});
