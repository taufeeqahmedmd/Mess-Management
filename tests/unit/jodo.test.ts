import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  resolveAuthHeader,
  isPaymentConfigComplete,
  describeJodoError,
  pickFieldErrors,
  getJodoOrderWithBackoff,
} from "@/lib/jodo";

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

describe("describeJodoError", () => {
  const body = {
    message: "Invalid payload!",
    status: "error",
    error_type: "BadRequestError",
    code: "E0000",
    errors: [{ key: "email", message: "value is not a valid email address" }],
  };

  it("surfaces field-level errors instead of the generic 'Invalid payload!'", () => {
    const d = describeJodoError(body, 400);
    expect(d.error).toBe("Payment gateway rejected: email (value is not a valid email address).");
    expect(d.fieldErrors).toEqual([{ key: "email", message: "value is not a valid email address" }]);
  });

  it("names a credentials problem on 401/403", () => {
    expect(describeJodoError({ message: "Unauthorized" }, 401).error).toMatch(/credentials/);
    expect(describeJodoError({ message: "Forbidden" }, 403).fieldErrors).toEqual([]);
  });

  it("falls back to the gateway message, then to a status line", () => {
    expect(describeJodoError({ message: "Collector not found" }, 404).error).toBe("Collector not found");
    expect(describeJodoError(null, 500).error).toBe("Payment gateway error (500).");
  });

  it("ignores malformed error entries", () => {
    expect(pickFieldErrors({ errors: [{ message: "no key" }, "str", { key: "phone" }] })).toEqual([{ key: "phone", message: "is invalid" }]);
    expect(pickFieldErrors({ errors: "nope" })).toEqual([]);
  });
});

describe("getJodoOrderWithBackoff", () => {
  const cfg = { base: "https://ext.jodo.in", auth: "Basic x", collectorCode: "C" };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const paid = () => reply(200, { status: "success", data: { status: "paid", transaction_id: "TXN1", details: [] } });
  const limited = () => reply(429, { message: "Too many requests." });

  function stubFetch(...responses: Response[]) {
    const fetchMock = vi.fn();
    for (const r of responses) fetchMock.mockResolvedValueOnce(r);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const noSleep = () => vi.fn<(ms: number) => Promise<void>>(async () => {});
  afterEach(() => vi.unstubAllGlobals());

  it("returns the first answer without waiting when Jodo isn't rate-limiting", async () => {
    const fetchMock = stubFetch(paid());
    const sleep = noSleep();

    const res = await getJodoOrderWithBackoff(cfg, "ORD", [1000, 2000], sleep);
    expect(res).toMatchObject({ ok: true, paid: true, transactionId: "TXN1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("waits and retries on 429 until the gateway answers", async () => {
    const fetchMock = stubFetch(limited(), limited(), paid());
    const sleep = noSleep();

    const res = await getJodoOrderWithBackoff(cfg, "ORD", [1000, 2000], sleep);
    expect(res).toMatchObject({ ok: true, paid: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it("returns the 429 once every wait is used up, so the caller can back off", async () => {
    const fetchMock = stubFetch(limited(), limited(), limited());
    const sleep = noSleep();

    const res = await getJodoOrderWithBackoff(cfg, "ORD", [1000, 2000], sleep);
    expect(res).toEqual({ ok: false, status: 429, error: "Too many requests." });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry other gateway errors", async () => {
    const fetchMock = stubFetch(reply(404, { message: "Order not found" }));
    const sleep = noSleep();

    const res = await getJodoOrderWithBackoff(cfg, "ORD", [1000, 2000], sleep);
    expect(res).toEqual({ ok: false, status: 404, error: "Order not found" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
