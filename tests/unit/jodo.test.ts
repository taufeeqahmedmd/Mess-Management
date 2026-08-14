import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { resolveAuthHeader, isPaymentConfigComplete } from "@/lib/jodo";

describe("resolveAuthHeader", () => {
  it("computes Basic base64(api_key:api_secret) when no auth_header is set", () => {
    expect(resolveAuthHeader({ apiKey: "user", apiSecret: "pass" })).toBe(
      `Basic ${Buffer.from("user:pass").toString("base64")}`,
    );
  });

  it("prefers a DB auth_header over the key/secret pair", () => {
    expect(resolveAuthHeader({ authHeader: "Basic abc123", apiKey: "user", apiSecret: "pass" })).toBe("Basic abc123");
  });

  it("sends an auth_header with a scheme verbatim", () => {
    expect(resolveAuthHeader({ authHeader: "Bearer tok-42" })).toBe("Bearer tok-42");
  });

  it("prefixes a bare token with Basic", () => {
    expect(resolveAuthHeader({ authHeader: "dXNlcjpwYXNz" })).toBe("Basic dXNlcjpwYXNz");
  });

  it("trims whitespace and ignores a blank auth_header", () => {
    expect(resolveAuthHeader({ authHeader: "  Basic abc  ", apiKey: null, apiSecret: null })).toBe("Basic abc");
    expect(resolveAuthHeader({ authHeader: "   ", apiKey: "user", apiSecret: "pass" })).toBe(
      `Basic ${Buffer.from("user:pass").toString("base64")}`,
    );
  });

  it("returns null when neither auth_header nor a full key/secret pair exists", () => {
    expect(resolveAuthHeader({})).toBeNull();
    expect(resolveAuthHeader({ apiKey: "user" })).toBeNull();
    expect(resolveAuthHeader({ apiSecret: "pass" })).toBeNull();
  });
});

describe("isPaymentConfigComplete", () => {
  const base = { collectorCode: "NACHARAM", url: "https://ext.jodo.in" };

  it("is complete with collector code + url + key/secret", () => {
    expect(isPaymentConfigComplete({ ...base, apiKey: "user", apiSecret: "pass" })).toBe(true);
  });

  it("is complete with collector code + url + auth_header only", () => {
    expect(isPaymentConfigComplete({ ...base, authHeader: "Basic abc123" })).toBe(true);
  });

  it("is incomplete without any usable credentials", () => {
    expect(isPaymentConfigComplete({ ...base })).toBe(false);
    expect(isPaymentConfigComplete({ ...base, apiKey: "user" })).toBe(false);
  });

  it("is incomplete without collector code or url, and for a missing row", () => {
    expect(isPaymentConfigComplete({ url: base.url, authHeader: "Basic abc" })).toBe(false);
    expect(isPaymentConfigComplete({ collectorCode: base.collectorCode, authHeader: "Basic abc" })).toBe(false);
    expect(isPaymentConfigComplete(null)).toBe(false);
    expect(isPaymentConfigComplete(undefined)).toBe(false);
  });
});
