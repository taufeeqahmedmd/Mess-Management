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
 * guard, balance checks, and the per-line ledger writes without a live DB.
 * "Tests follow the money" (CLAUDE.md).
 */

const D = (n: string | number) => new Prisma.Decimal(n);

type Scenario = {
  requestMissing?: boolean;
  status?: string;
  items?: { mealTypeId: bigint; unitPrice: Prisma.Decimal; unitVendorPrice: Prisma.Decimal; qty: number }[];
  walletBalance?: string | null; // null = no wallet
  userStatus?: "active" | "suspended" | "inactive";
  cardMissing?: boolean;
  cardStatus?: "active" | "blocked" | "lost";
  cardUserId?: bigint;
  forceConflict?: boolean;
  claimLost?: boolean; // a concurrent delivery won the status compare-and-swap
};

function buildTx(s: Scenario) {
  const calls = {
    redemptions: [] as Record<string, unknown>[],
    walletTxns: [] as Record<string, unknown>[],
    updatedRequest: null as Record<string, unknown> | null,
    event: null as Record<string, unknown> | null,
    walletUpdated: false,
  };

  const hasWallet = s.walletBalance !== null;
  const wallet = hasWallet ? { id: BigInt(5), balanceAmount: D(s.walletBalance ?? "1000"), version: 0 } : null;
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
    wallet,
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

  const total = items.reduce((sum, i) => sum.plus(i.unitPrice.mul(i.qty)), D(0));

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
    wallet: {
      updateMany: async () => {
        calls.walletUpdated = true;
        return { count: s.forceConflict ? 0 : 1 };
      },
      findUnique: async () => ({ balanceAmount: wallet ? wallet.balanceAmount.minus(total) : D(0) }),
    },
    redemption: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.redemptions.push(data);
        return { id: BigInt(calls.redemptions.length) };
      },
    },
    walletTransaction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.walletTxns.push(data);
        return {};
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
  it("delivers, charges the recomputed total, posts a redemption per line + DR ledger", async () => {
    const { tx, calls } = buildTx({ walletBalance: "1000" });
    const r = await fulfillFoodRequest(tx, params);

    expect(r.status).toBe("DELIVERED");
    expect(r.charged).toBe("50.00"); // 15×2 + 20×1
    expect(calls.walletUpdated).toBe(true);
    expect(calls.redemptions).toHaveLength(2);
    expect(calls.redemptions.every((x) => x.foodRequestId === BigInt(1) && x.counterId === BigInt(7) && x.paidBy === "wallet")).toBe(true);
    expect(calls.walletTxns).toHaveLength(2);
    expect(calls.walletTxns.every((x) => x.txnType === "DR" && x.sourceTable === "redemption")).toBe(true);
    expect(calls.updatedRequest?.status).toBe("delivered");
    expect(calls.event?.toStatus).toBe("delivered");
  });

  it("debits the wallet only once, for the full total", async () => {
    const { tx, calls } = buildTx({ walletBalance: "1000" });
    await fulfillFoodRequest(tx, params);
    // one DR per line, summing to the total
    const sum = calls.walletTxns.reduce((s, x) => s + Number(x.amount), 0);
    expect(sum).toBe(50);
  });
});

describe("fulfillFoodRequest — idempotency & guards", () => {
  it("is idempotent: an already-delivered request returns without re-charging", async () => {
    const { tx, calls } = buildTx({ status: "delivered", walletBalance: "1000" });
    const r = await fulfillFoodRequest(tx, params);
    expect(r.status).toBe("DELIVERED");
    expect(r.reason).toBe("Already delivered");
    expect(calls.walletUpdated).toBe(false);
    expect(calls.redemptions).toHaveLength(0);
  });

  it("loses the status compare-and-swap to a concurrent delivery → idempotent, no charge", async () => {
    const { tx, calls } = buildTx({ walletBalance: "1000", claimLost: true });
    const r = await fulfillFoodRequest(tx, params);
    expect(r.status).toBe("DELIVERED");
    expect(r.reason).toBe("Already delivered");
    expect(calls.walletUpdated).toBe(false);
    expect(calls.redemptions).toHaveLength(0);
  });

  it("rejects a request that isn't out for delivery (no charge)", async () => {
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
    expect(calls.walletUpdated).toBe(false);
  });

  it("rejects a blocked card", async () => {
    const { tx } = buildTx({ cardStatus: "blocked" });
    expect((await fulfillFoodRequest(tx, params)).reason).toBe("CARD BLOCKED");
  });
});

describe("fulfillFoodRequest — funds", () => {
  it("rejects when the wallet can't cover the charge (no ledger writes)", async () => {
    const { tx, calls } = buildTx({ walletBalance: "10" });
    const r = await fulfillFoodRequest(tx, params);
    expect(r.status).toBe("REJECTED");
    expect(r.reason).toBe("INSUFFICIENT BALANCE");
    expect(calls.redemptions).toHaveLength(0);
    expect(calls.walletUpdated).toBe(false);
  });

  it("throws a retryable conflict when the optimistic-lock guard loses", async () => {
    const { tx } = buildTx({ walletBalance: "1000", forceConflict: true });
    await expect(fulfillFoodRequest(tx, params)).rejects.toBeInstanceOf(FulfillConflictError);
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
