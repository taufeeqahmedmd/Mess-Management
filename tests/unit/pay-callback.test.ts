import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Online top-up return path — the payer comes back from Jodo checkout and the
 * order must be found and credited. Covers: the order reference minted by
 * `/api/public/pay` rides in the callback URL path and is the same key stored on
 * the payment order; the callback finds the order by that ref regardless of the
 * redirect's query params (Jodo doesn't document any); legacy query-param
 * lookup still works; the STORED Jodo order id is what gets verified; unpaid /
 * unknown / already-credited / credit-failure outcomes. DB, gateway and credit
 * executor mocked at the boundary. "Tests follow the money" (CLAUDE.md).
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
    paymentOrder: {
      findUnique: (...a: unknown[]) => orderFindUnique(...a),
      create: (...a: unknown[]) => orderCreate(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findFirst: (...a: unknown[]) => userFindFirst(...a),
    },
  },
}));
vi.mock("@/lib/jodo", () => ({
  getJodoOrderWithBackoff: (...a: unknown[]) => getJodoOrder(...a),
  createJodoOrder: (...a: unknown[]) => createJodoOrder(...a),
  resolveJodoConfig: (...a: unknown[]) => resolveJodoConfig(...a),
}));
vi.mock("@/lib/run-online-topup", () => ({ creditPaymentOrder: (...a: unknown[]) => creditPaymentOrder(...a) }));
vi.mock("@/services/pricing", () => ({ defaultRatesForCategory: (...a: unknown[]) => defaultRatesForCategory(...a) }));

import { GET as legacyCallback } from "@/app/api/public/pay/callback/route";
import { GET as refCallback } from "@/app/api/public/pay/callback/[ref]/route";
import { POST as pay } from "@/app/api/public/pay/route";

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
  refCallback(new Request(`http://app.test/api/public/pay/callback/${ref}${query}`), {
    params: Promise.resolve({ ref }),
  });
const viaLegacy = (query = "") => legacyCallback(new Request(`http://app.test/api/public/pay/callback${query}`));

/** The /top-up redirect's query params. */
function landing(res: Response) {
  expect(res.status).toBe(303);
  return Object.fromEntries(new URL(res.headers.get("location")!).searchParams);
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.APP_URL;
  orderFindUnique.mockResolvedValue(record());
  userFindUnique.mockResolvedValue({ code: "EMP001" });
  resolveJodoConfig.mockResolvedValue(CFG);
  getJodoOrder.mockResolvedValue({ ok: true, paid: true, orderStatus: "paid", amount: 120, transactionId: "TXN9", raw: {} });
  creditPaymentOrder.mockResolvedValue({ ok: true, already: false });
});

describe("GET /api/public/pay/callback/[ref]", () => {
  it("finds the order by ref with no gateway params and credits it once paid", async () => {
    const res = await viaRef(REF);

    expect(orderFindUnique).toHaveBeenCalledWith({ where: { clientUuid: REF } });
    expect(getJodoOrder).toHaveBeenCalledWith(CFG, "JODO-1", [1000, 2000]);
    expect(creditPaymentOrder).toHaveBeenCalledWith(record(), "TXN9");
    expect(landing(res)).toEqual({ paid: "1", code: "EMP001" });
  });

  it("verifies the STORED Jodo order id, never one taken from the redirect", async () => {
    await viaRef(REF, "?order_id=SOMEONE-ELSES-ORDER");

    expect(orderFindUnique).toHaveBeenCalledWith({ where: { clientUuid: REF } });
    expect(getJodoOrder).toHaveBeenCalledWith(CFG, "JODO-1", [1000, 2000]);
  });

  it("rejects a malformed ref without querying the DB", async () => {
    const res = await viaRef("not-a-uuid");

    expect(orderFindUnique).not.toHaveBeenCalled();
    expect(creditPaymentOrder).not.toHaveBeenCalled();
    expect(landing(res)).toEqual({ pay: "error" });
  });

  it("reports an unknown ref as an error", async () => {
    orderFindUnique.mockResolvedValue(null);
    const res = await viaRef(REF);

    expect(creditPaymentOrder).not.toHaveBeenCalled();
    expect(landing(res)).toEqual({ pay: "error" });
  });

  it("shows success for an already-credited order without re-verifying or re-crediting", async () => {
    orderFindUnique.mockResolvedValue(record({ status: "credited" }));
    const res = await viaRef(REF);

    expect(getJodoOrder).not.toHaveBeenCalled();
    expect(creditPaymentOrder).not.toHaveBeenCalled();
    expect(landing(res)).toEqual({ paid: "1", code: "EMP001" });
  });

  it("leaves an unpaid order pending (reconcile settles it later)", async () => {
    getJodoOrder.mockResolvedValue({ ok: true, paid: false, orderStatus: "unpaid", amount: 120, transactionId: null, raw: {} });
    const res = await viaRef(REF);

    expect(creditPaymentOrder).not.toHaveBeenCalled();
    expect(landing(res)).toEqual({ pay: "pending", code: "EMP001" });
  });

  it("leaves the order pending when the gateway can't be reached", async () => {
    getJodoOrder.mockResolvedValue({ ok: false, error: "down" });
    const res = await viaRef(REF);

    expect(creditPaymentOrder).not.toHaveBeenCalled();
    expect(landing(res)).toEqual({ pay: "pending", code: "EMP001" });
  });

  it("leaves the order pending (for reconcile) when Jodo still rate-limits after backoff", async () => {
    getJodoOrder.mockResolvedValue({ ok: false, status: 429, error: "Too many requests." });
    const res = await viaRef(REF);

    expect(creditPaymentOrder).not.toHaveBeenCalled();
    expect(landing(res)).toEqual({ pay: "pending", code: "EMP001" });
  });

  it("reports an error when crediting fails (e.g. a lapsed rate)", async () => {
    creditPaymentOrder.mockResolvedValue({ ok: false, error: "A meal has no current rate." });
    const res = await viaRef(REF);

    expect(landing(res)).toEqual({ pay: "error", code: "EMP001" });
  });

  it("redirects to APP_URL when set", async () => {
    process.env.APP_URL = "https://mess.example/";
    const res = await viaRef(REF);

    expect(res.headers.get("location")).toMatch(/^https:\/\/mess\.example\/top-up\?/);
  });
});

describe("GET /api/public/pay/callback (legacy, pre-ref orders)", () => {
  it.each(["order", "order_id", "id"])("finds the order by Jodo's ?%s= param", async (param) => {
    const res = await viaLegacy(`?${param}=JODO-1`);

    expect(orderFindUnique).toHaveBeenCalledWith({ where: { jodoOrderId: "JODO-1" } });
    expect(creditPaymentOrder).toHaveBeenCalledTimes(1);
    expect(landing(res)).toEqual({ paid: "1", code: "EMP001" });
  });

  it("reports an error when the redirect carries no order id", async () => {
    const res = await viaLegacy();

    expect(orderFindUnique).not.toHaveBeenCalled();
    expect(creditPaymentOrder).not.toHaveBeenCalled();
    expect(landing(res)).toEqual({ pay: "error" });
  });
});

describe("POST /api/public/pay — callback ref", () => {
  it("puts the order's own ref in the callback path and stores the same ref", async () => {
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

    const res = await pay(
      new Request("http://app.test/api/public/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.5" },
        body: JSON.stringify({ code: "EMP001", items: [{ mealId: "5", qty: 2 }] }),
      }),
    );
    expect(res.status).toBe(200);

    const { callbackUrl } = createJodoOrder.mock.calls[0][1] as { callbackUrl: string };
    const m = callbackUrl.match(/^https:\/\/mess\.example\/api\/public\/pay\/callback\/([0-9a-f-]{36})$/);
    expect(m).not.toBeNull();

    const stored = orderCreate.mock.calls[0][0] as { data: { clientUuid: string; jodoOrderId: string } };
    expect(stored.data.clientUuid).toBe(m![1]);
    expect(stored.data.jodoOrderId).toBe("JODO-1");
  });
});
