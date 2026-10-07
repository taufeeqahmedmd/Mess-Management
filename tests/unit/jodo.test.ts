import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  resolveAuthHeader,
  isPaymentConfigComplete,
  describeJodoError,
  pickFieldErrors,
  jodoSignature,
  verifyJodoSignature,
  createJodoOrder,
  addJodoWebhook,
  listJodoWebhooks,
  disableJodoWebhook,
  JODO_NOTE_REF_KEY,
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

describe("webhook signature", () => {
  const raw = '{"event_id":"e1","event":"order.payment.debited"}';
  it("is hex HMAC-SHA256 of the raw body with the shared secret", () => {
    const sig = jodoSignature("my-secret-key", raw);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyJodoSignature("my-secret-key", raw, sig)).toBe(true);
    expect(verifyJodoSignature("my-secret-key", raw, sig.toUpperCase())).toBe(true); // header case-insensitive
  });
  it("rejects a wrong secret, a tampered body, or a missing/short header", () => {
    const sig = jodoSignature("my-secret-key", raw);
    expect(verifyJodoSignature("other", raw, sig)).toBe(false);
    expect(verifyJodoSignature("my-secret-key", raw + " ", sig)).toBe(false);
    expect(verifyJodoSignature("my-secret-key", raw, null)).toBe(false);
    expect(verifyJodoSignature("my-secret-key", raw, "abc")).toBe(false);
    expect(verifyJodoSignature("", raw, sig)).toBe(false);
  });
});

describe("createJodoOrder — notes", () => {
  const cfg = { base: "https://ext.jodo.in", auth: "Basic x", collectorCode: "C" };
  afterEach(() => vi.unstubAllGlobals());

  it("sends `notes` (our order ref) so Jodo echoes it back in webhooks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "success", data: { order_id: "o1", redirect_url: "https://pay.jodo.in/p" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await createJodoOrder(cfg, {
      name: "A", phone: "9876543210", email: "a@b.co", collectorCode: "C", amount: 60, callbackUrl: "https://app/cb",
      notes: [{ key: JODO_NOTE_REF_KEY, value: "ref-1" }],
    });
    expect(r).toMatchObject({ ok: true, orderId: "o1", paymentUrl: "https://pay.jodo.in/p" });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.notes).toEqual([{ key: "mess_ref", value: "ref-1" }]);
    expect(body.callback_url).toBe("https://app/cb");
  });
});

describe("webhook management APIs", () => {
  const cfg = { base: "https://ext.jodo.in", auth: "Basic x", collectorCode: "C" };
  afterEach(() => vi.unstubAllGlobals());

  it("adds a subscription with event, url, secret and failure email", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "success", data: { id: "wh1", event_code: "order.payment.debited", url: "https://app/w" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await addJodoWebhook(cfg, { eventCode: "order.payment.debited", url: "https://app/w", secretKey: "s", failureEmail: "ops@x.y" });
    expect(r).toEqual({ ok: true, webhook: { id: "wh1", eventCode: "order.payment.debited", url: "https://app/w", failureEmail: null } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ext.jodo.in/api/v1/integrations/erp/webhooks");
    expect(JSON.parse(init.body as string)).toEqual({
      collector_code: "C",
      event_code: "order.payment.debited",
      url: "https://app/w",
      secret_key: "s",
      failure_notification_email: "ops@x.y",
    });
  });

  it("lists and disables subscriptions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "success", data: [{ id: "wh1", event_code: "x", url: "u", failure_notification_email: "e" }, { bad: 1 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "success" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listJodoWebhooks(cfg)).toMatchObject({ ok: true, webhooks: [{ id: "wh1", eventCode: "x", url: "u", failureEmail: "e" }] });
    expect(await disableJodoWebhook(cfg, "wh1")).toEqual({ ok: true });
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe("https://ext.jodo.in/api/v1/integrations/erp/webhooks/wh1");
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe("DELETE");
  });
});
