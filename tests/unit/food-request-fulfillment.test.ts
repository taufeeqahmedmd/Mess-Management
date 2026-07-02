import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  fulfillFoodRequest,
  FulfillConflictError,
  isRetryableFulfillError,
  type FulfillParams,
} from "@/services/food-request-fulfillment";

/**
 * Fulfilment engine over a hand-rolled in-memory transaction client (same model
 * as consumption.test.ts) — covers RFID verification, idempotency, the status
 * guard, and the per-line redemption writes without a live DB. Coupon-only: a
 * delivery records consumption for settlement/reports but does NOT charge the
 * cardholder. "Tests follow the money" (CLAUDE.md).
 */

const D = (n: string | number) => new Prisma.Decimal(n);

type Scenario = {
  requestMissing?: boolean;
  status?: string;
  items?: { mealTypeId: bigint; unitPrice: Prisma.Decimal; unitVendorPrice: Prisma.Decimal; qty: number }[];
  userStatus?: "active" | "suspended" | "inactive";
  cardMissing?: boolean;
  cardStatus?: "active" | "blocked" | "lost";
  cardUserId?: bigint;
  claimLost?: boolean; // a concurrent delivery won the status compare-and-swap
};

function buildTx(s: Scenario) {
  const calls = {
    redemptions: [] as Record<string, unknown>[],
    updatedRequest: null as Record<string, unknown> | null,
    event: null as Record<string, unknown> | null,
  };

  const items = s.items ?? [
    { mealTypeId: BigInt(5), unitPrice: D("15"), unitVendorPrice: D("10"), qty: 2 },
    { mealTypeId: BigInt(6), unitPrice: D("20"), unitVendorPrice: D("14"), qty: 1 },
  ];
  const user = {
    id: BigInt(1),
    fullName: "Asha",
    code: "EMP1",
    categoryId: BigInt(10),
    status: s.userStatus ?? "active",
    category: { name: "Staff" },
  };
  const req = s.requestMissing
    ? null
    : {
        id: BigInt(1),
        code: "FR-000001",
        status: s.status ?? "out_for_delivery",
        userId: BigInt(1),
        branchId: BigInt(100),
        amount: D("50"),
        items,
        user,
      };
  const card = s.cardMissing ? null : { id: BigInt(2), status: s.cardStatus ?? "active", userId: s.cardUserId ?? BigInt(1) };

  let findCount = 0;
  const tx = {
    foodRequest: {
      findUnique: async () => {
        findCount += 1;
        // First read = the initial load; a later read (on a lost claim) sees the
        // request already delivered by the winning transaction.
        if (findCount === 1 || !req) return req;
        return { ...req, status: "delivered" };
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (s.claimLost) return { count: 0 };
        calls.updatedRequest = data;
        return { count: 1 };
      },
    },
    rfidCard: { findUnique: async () => card },
    counter: {
      findFirst: async () => ({ id: BigInt(7), branchId: BigInt(100), code: "FR" }),
      create: async () => ({ id: BigInt(7) }),
    },
    redemption: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.redemptions.push(data);
        return { id: BigInt(calls.redemptions.length) };
      },
    },
    foodRequestEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.event = data;
        return {};
      },
    },
  } as unknown as Prisma.TransactionClient;

  return { tx, calls };
}

const params: FulfillParams = {
  requestId: BigInt(1),
  cardUid: "1000000001",
  clientUuid: "11111111-1111-1111-1111-111111111111",
  vendorAppUserId: BigInt(9),
  at: new Date("2026-06-18T12:00:00Z"),
};

describe("fulfillFoodRequest — happy path", () => {
  it("delivers, records the recomputed value, posts a redemption per line (no charge)", async () => {
    const { tx, calls } = buildTx({});
    const r = await fulfillFoodRequest(tx, params);

    expect(r.status).toBe("DELIVERED");
    expect(r.charged).toBe("50.00"); // 15×2 + 20×1
    expect(calls.redemptions).toHaveLength(2);
    // Coupon-only: no cardholder charge — amount is 0, paidBy null, vendor cost kept.
    expect(
      calls.redemptions.every(
        (x) => x.foodRequestId === BigInt(1) && x.counterId === BigInt(7) && x.paidBy === null,
      ),
    ).toBe(true);
    expect(calls.redemptions.every((x) => (x.amount as Prisma.Decimal).toFixed(2) === "0.00")).toBe(true);
    expect(calls.updatedRequest?.status).toBe("delivered");
    expect(calls.event?.toStatus).toBe("delivered");
  });

  it("carries the per-line sale (rateApplied) and vendor amounts for reporting/settlement", async () => {
    const { tx, calls } = buildTx({});
    await fulfillFoodRequest(tx, params);
    const sale = calls.redemptions.reduce((s, x) => s + Number((x.rateApplied as Prisma.Decimal).toString()), 0);
    const vendor = calls.redemptions.reduce((s, x) => s + Number((x.vendorAmount as Prisma.Decimal).toString()), 0);
    expect(sale).toBe(50); // 30 + 20
    expect(vendor).toBe(34); // 20 + 14
  });
});

describe("fulfillFoodRequest — idempotency & guards", () => {
  it("is idempotent: an already-delivered request returns without re-posting", async () => {
    const { tx, calls } = buildTx({ status: "delivered" });
    const r = await fulfillFoodRequest(tx, params);
    expect(r.status).toBe("DELIVERED");
    expect(r.reason).toBe("Already delivered");
    expect(calls.redemptions).toHaveLength(0);
  });

  it("loses the status compare-and-swap to a concurrent delivery → idempotent, no post", async () => {
    const { tx, calls } = buildTx({ claimLost: true });
    const r = await fulfillFoodRequest(tx, params);
    expect(r.status).toBe("DELIVERED");
    expect(r.reason).toBe("Already delivered");
    expect(calls.redemptions).toHaveLength(0);
  });

  it("rejects a request that isn't out for delivery (no post)", async () => {
    const { tx, calls } = buildTx({ status: "preparing" });
    const r = await fulfillFoodRequest(tx, params);
    expect(r.status).toBe("REJECTED");
    expect(calls.redemptions).toHaveLength(0);
  });

  it("rejects a missing request", async () => {
    const { tx } = buildTx({ requestMissing: true });
    expect((await fulfillFoodRequest(tx, params)).status).toBe("REJECTED");
  });
});

describe("fulfillFoodRequest — RFID verification", () => {
  it("rejects an unknown card", async () => {
    const { tx, calls } = buildTx({ cardMissing: true });
    const r = await fulfillFoodRequest(tx, params);
    expect(r.reason).toBe("UNKNOWN CARD");
    expect(calls.redemptions).toHaveLength(0);
  });

  it("rejects a card belonging to a different cardholder", async () => {
    const { tx, calls } = buildTx({ cardUserId: BigInt(99) });
    const r = await fulfillFoodRequest(tx, params);
    expect(r.reason).toBe("CARD DOES NOT MATCH CARDHOLDER");
    expect(calls.redemptions).toHaveLength(0);
  });

  it("rejects a blocked card", async () => {
    const { tx } = buildTx({ cardStatus: "blocked" });
    expect((await fulfillFoodRequest(tx, params)).reason).toBe("CARD BLOCKED");
  });
});

describe("isRetryableFulfillError", () => {
  it("flags conflicts and duplicate client_uuid, not generic errors", () => {
    expect(isRetryableFulfillError(new FulfillConflictError())).toBe(true);
    expect(isRetryableFulfillError(new Prisma.PrismaClientKnownRequestError("x", { code: "P2034", clientVersion: "x" }))).toBe(true);
    expect(
      isRetryableFulfillError(new Prisma.PrismaClientKnownRequestError("x", { code: "P2002", clientVersion: "x", meta: { target: ["client_uuid"] } })),
    ).toBe(true);
    expect(isRetryableFulfillError(new Error("nope"))).toBe(false);
  });
});
