import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Online top-up start + return path. `/api/public/pay` must send our order ref
 * both in the callback URL path and in Jodo's `notes` (echoed in webhooks), and
 * schedule the safety-net poll. The callback is a navigation signal only: it
 * NEVER calls Jodo or credits — it locates the order and hands the payer to the
 * return page, which polls our status endpoint. Legacy query-param returns
 * (pre-ref orders) still resolve. DB + gateway mocked at the boundary.
 */

const orderFindUnique = vi.fn();
const orderCreate = vi.fn();
const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
const getJodoOrder = vi.fn();
const createJodoOrder = vi.fn();
const resolveJodoConfig = vi.fn();
const creditPaymentOrder = vi.fn();
const defaultRatesForCategory = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentOrder: { findUnique: (...a: unknown[]) => orderFindUnique(...a), create: (...a: unknown[]) => orderCreate(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a), findFirst: (...a: unknown[]) => userFindFirst(...a) },
  },
}));
vi.mock("@/lib/jodo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jodo")>();
  return {
    ...actual,
    getJodoOrder: (...a: unknown[]) => getJodoOrder(...a),
    createJodoOrder: (...a: unknown[]) => createJodoOrder(...a),
    resolveJodoConfig: (...a: unknown[]) => resolveJodoConfig(...a),
  };
});
vi.mock("@/lib/run-online-topup", () => ({ creditPaymentOrder: (...a: unknown[]) => creditPaymentOrder(...a) }));
vi.mock("@/services/pricing", () => ({ defaultRatesForCategory: (...a: unknown[]) => defaultRatesForCategory(...a) }));

import { GET as legacyCallback } from "@/app/api/public/pay/callback/route";
import { GET as refCallback } from "@/app/api/public/pay/callback/[ref]/route";
import { POST as pay } from "@/app/api/public/pay/route";
import { __resetRateLimits } from "@/lib/rate-limit";

const REF = "11111111-1111-4111-8111-111111111111";
const CFG = { base: "https://ext.jodo.in", auth: "Basic dXNlcjpwYXNz", collectorCode: "NACHARAM" };

const record = (over: Record<string, unknown> = {}) => ({
  id: BigInt(1),
  jodoOrderId: "JODO-1",
  clientUuid: REF,
  userId: BigInt(7),
  branchId: BigInt(1),
  status: "pending",
  items: [{ mealTypeId: "5", qty: 2 }],
  ...over,
});

const viaRef = (ref: string, query = "") =>
  refCallback(new Request(`http://app.test/api/public/pay/callback/${ref}${query}`), { params: Promise.resolve({ ref }) });
const viaLegacy = (query = "") => legacyCallback(new Request(`http://app.test/api/public/pay/callback${query}`));

/** The /top-up redirect's query params. */
function landing(res: Response) {
  expect(res.status).toBe(303);
  return Object.fromEntries(new URL(res.headers.get("location")!).searchParams);
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  delete process.env.APP_URL;
  orderFindUnique.mockResolvedValue(record());
  userFindUnique.mockResolvedValue({ code: "EMP001" });
  resolveJodoConfig.mockResolvedValue(CFG);
});

describe("GET /api/public/pay/callback/[ref]", () => {
  it("finds the order by ref and hands off to the return page — no gateway call, no credit", async () => {
    const res = await viaRef(REF, "?order_id=whatever-jodo-appended");

    expect(orderFindUnique).toHaveBeenCalledWith({ where: { clientUuid: REF } });
    expect(getJodoOrder).not.toHaveBeenCalled();
    expect(creditPaymentOrder).not.toHaveBeenCalled();
    expect(landing(res)).toEqual({ ref: REF, code: "EMP001" });
  });

  it("hands off even when already credited (the status poll resolves immediately)", async () => {
    orderFindUnique.mockResolvedValue(record({ status: "credited" }));
    expect(landing(await viaRef(REF))).toEqual({ ref: REF, code: "EMP001" });
  });

  it("rejects a malformed ref without querying the DB", async () => {
    const res = await viaRef("not-a-uuid");
    expect(orderFindUnique).not.toHaveBeenCalled();
    expect(landing(res)).toEqual({ pay: "error" });
  });

  it("reports an unknown ref as an error", async () => {
    orderFindUnique.mockResolvedValue(null);
    expect(landing(await viaRef(REF))).toEqual({ pay: "error" });
  });

  it("redirects to APP_URL when set", async () => {
    process.env.APP_URL = "https://mess.example/";
    const res = await viaRef(REF);
    expect(res.headers.get("location")).toMatch(/^https:\/\/mess\.example\/top-up\?/);
  });
});

describe("GET /api/public/pay/callback (legacy, pre-ref orders)", () => {
  it.each(["order", "order_id", "id"])("finds the order by Jodo's ?%s= param and hands off by ref", async (param) => {
    const res = await viaLegacy(`?${param}=JODO-1`);
    expect(orderFindUnique).toHaveBeenCalledWith({ where: { jodoOrderId: "JODO-1" } });
    expect(getJodoOrder).not.toHaveBeenCalled();
    expect(landing(res)).toEqual({ ref: REF, code: "EMP001" });
  });

  it("reports an error when the redirect carries no order id", async () => {
    const res = await viaLegacy();
    expect(orderFindUnique).not.toHaveBeenCalled();
    expect(landing(res)).toEqual({ pay: "error" });
  });
});

describe("POST /api/public/pay — order creation", () => {
  beforeEach(() => {
    userFindFirst.mockResolvedValue({
      id: BigInt(7),
      code: "EMP001",
      fullName: "Asha Rao",
      branchId: BigInt(1),
      categoryId: BigInt(10),
      status: "active",
      validityExpired: false,
      phone: "9876543210",
      email: "asha@example.com",
    });
    defaultRatesForCategory.mockResolvedValue({ "5": "60.00" });
    createJodoOrder.mockResolvedValue({ ok: true, orderId: "JODO-1", paymentUrl: "https://pay.jodo.in/x", raw: {} });
    process.env.APP_URL = "https://mess.example";
  });

  const post = () =>
    pay(
      new Request("http://app.test/api/public/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.5" },
        body: JSON.stringify({ code: "EMP001", items: [{ mealId: "5", qty: 2 }] }),
      }),
    );

  it("sends our ref in the callback path AND in notes, stores the same ref, and returns it", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();

    const input = createJodoOrder.mock.calls[0][1] as { callbackUrl: string; notes?: { key: string; value: string }[] };
    const m = input.callbackUrl.match(/^https:\/\/mess\.example\/api\/public\/pay\/callback\/([0-9a-f-]{36})$/);
    expect(m).not.toBeNull();
    const ref = m![1];
    expect(input.notes).toEqual([{ key: "mess_ref", value: ref }]);

    const stored = orderCreate.mock.calls[0][0] as { data: { clientUuid: string; jodoOrderId: string; status: string } };
    expect(stored.data).toMatchObject({ clientUuid: ref, jodoOrderId: "JODO-1", status: "pending" });
    expect(body).toMatchObject({ paymentUrl: "https://pay.jodo.in/x", amount: "120.00", ref });
  });

  it("schedules the safety-net poll 15 minutes after creation (the webhook's window)", async () => {
    await post();
    const stored = orderCreate.mock.calls[0][0] as { data: { createdAt: Date; nextCheckAt: Date } };
    expect(stored.data.nextCheckAt.getTime() - stored.data.createdAt.getTime()).toBe(15 * 60_000);
  });
});
