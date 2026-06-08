import { describe, it, expect } from "vitest";
import {
  type Actor,
  type Permission,
  AuthorizationError,
  can,
  canAccessBranch,
  requirePermission,
} from "@/lib/rbac";

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: "1",
    isSuperAdmin: false,
    permissions: new Set<Permission>(),
    branchId: "10",
    ...overrides,
  };
}

describe("rbac.can", () => {
  it("denies by default when the permission is absent", () => {
    expect(can(actor(), "recharge.create")).toBe(false);
  });

  it("allows when the actor holds the permission", () => {
    expect(
      can(actor({ permissions: new Set(["recharge.create"]) }), "recharge.create"),
    ).toBe(true);
  });

  it("lets Super Admin bypass any check", () => {
    expect(can(actor({ isSuperAdmin: true }), "settings.manage")).toBe(true);
  });
});

describe("rbac.requirePermission", () => {
  it("throws AuthorizationError when missing", () => {
    expect(() => requirePermission(actor(), "users.delete")).toThrow(
      AuthorizationError,
    );
  });

  it("does not throw when allowed", () => {
    expect(() =>
      requirePermission(actor({ permissions: new Set(["users.delete"]) }), "users.delete"),
    ).not.toThrow();
  });
});

describe("rbac.canAccessBranch", () => {
  it("scoped actor can access only its own branch", () => {
    const a = actor({ branchId: "10" });
    expect(canAccessBranch(a, "10")).toBe(true);
    expect(canAccessBranch(a, "20")).toBe(false);
  });

  it("all-branch actor (branchId null) can access any branch", () => {
    expect(canAccessBranch(actor({ branchId: null }), "99")).toBe(true);
  });
});
