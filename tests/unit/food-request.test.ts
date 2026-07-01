import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  requestCode,
  priceLines,
  resolveInitialStatus,
  parseApprovalConfig,
  parseItemsJson,
  isEditable,
  isCancellable,
  DEFAULT_APPROVAL_CONFIG,
  type CatalogItem,
} from "@/services/food-request";

const D = (n: string | number) => new Prisma.Decimal(n);

function catalog(items: Array<Partial<CatalogItem> & { id: bigint }>): Map<string, CatalogItem> {
  return new Map(
    items.map((i) => [
      i.id.toString(),
      {
        id: i.id,
        mealTypeId: i.mealTypeId ?? BigInt(1),
        unitPrice: i.unitPrice ?? D(0),
        unitVendorPrice: i.unitVendorPrice ?? D(0),
        active: i.active ?? true,
      },
    ]),
  );
}

describe("requestCode", () => {
  it("zero-pads to six digits", () => {
    expect(requestCode(BigInt(1))).toBe("FR-000001");
    expect(requestCode(BigInt(123))).toBe("FR-000123");
    expect(requestCode(BigInt(1234567))).toBe("FR-1234567");
  });
});

describe("priceLines", () => {
  const cat = catalog([
    { id: BigInt(10), unitPrice: D("15.00"), unitVendorPrice: D("10.00"), mealTypeId: BigInt(5) },
    { id: BigInt(20), unitPrice: D("60.00"), unitVendorPrice: D("48.00"), mealTypeId: BigInt(6) },
    { id: BigInt(30), unitPrice: D("20.00"), unitVendorPrice: D("14.00"), active: false },
  ]);

  it("sums qty × unit for sale and vendor cost", () => {
    const r = priceLines(
      [
        { foodItemId: BigInt(10), qty: 3, description: null },
        { foodItemId: BigInt(20), qty: 2, description: null },
      ],
      cat,
    );
    expect("amount" in r && r.amount.toFixed(2)).toBe("165.00"); // 45 + 120
    expect("vendorAmount" in r && r.vendorAmount.toFixed(2)).toBe("126.00"); // 30 + 96
    expect("lines" in r && r.lines[0].mealTypeId).toBe(BigInt(5));
  });

  it("rejects an empty list", () => {
    expect(priceLines([], cat)).toEqual({ error: expect.any(String) });
  });

  it("rejects an unknown item", () => {
    const r = priceLines([{ foodItemId: BigInt(99), qty: 1, description: null }], cat);
    expect("error" in r).toBe(true);
  });

  it("rejects an inactive item", () => {
    const r = priceLines([{ foodItemId: BigInt(30), qty: 1, description: null }], cat);
    expect("error" in r).toBe(true);
  });

  it("rejects a non-positive quantity", () => {
    const r = priceLines([{ foodItemId: BigInt(10), qty: 0, description: null }], cat);
    expect("error" in r).toBe(true);
  });
});

describe("resolveInitialStatus", () => {
  it("goes straight to raised when approval is disabled", () => {
    expect(resolveInitialStatus({ ...DEFAULT_APPROVAL_CONFIG, enabled: false }, D("9999"))).toEqual({
      status: "raised",
      approvalRequired: false,
    });
  });

  it("requires approval when enabled with no threshold", () => {
    expect(resolveInitialStatus({ enabled: true, autoApproveBelow: null, approverPermission: "foodRequests.approve" }, D("1"))).toEqual({
      status: "pending_approval",
      approvalRequired: true,
    });
  });

  it("auto-approves below the threshold, requires approval at or above it", () => {
    const cfg = { enabled: true, autoApproveBelow: 500, approverPermission: "foodRequests.approve" };
    expect(resolveInitialStatus(cfg, D("499.99")).status).toBe("raised");
    expect(resolveInitialStatus(cfg, D("500")).status).toBe("pending_approval");
    expect(resolveInitialStatus(cfg, D("500.01")).status).toBe("pending_approval");
  });
});

describe("parseApprovalConfig", () => {
  it("falls back to safe defaults on junk", () => {
    expect(parseApprovalConfig(null)).toEqual(DEFAULT_APPROVAL_CONFIG);
    expect(parseApprovalConfig({ enabled: "yes", autoApproveBelow: -5 })).toEqual(DEFAULT_APPROVAL_CONFIG);
  });

  it("reads a valid config", () => {
    expect(parseApprovalConfig({ enabled: true, autoApproveBelow: 200, approverPermission: "x.y" })).toEqual({
      enabled: true,
      autoApproveBelow: 200,
      approverPermission: "x.y",
    });
  });
});

describe("parseItemsJson", () => {
  it("parses a valid item list", () => {
    const r = parseItemsJson(JSON.stringify([{ foodItemId: "10", qty: 2, description: " note " }]));
    expect(Array.isArray(r) && r[0]).toEqual({ foodItemId: BigInt(10), qty: 2, description: "note" });
  });

  it("errors on malformed JSON", () => {
    expect(parseItemsJson("{not json")).toEqual({ error: expect.any(String) });
  });

  it("errors on an invalid shape", () => {
    expect(parseItemsJson(JSON.stringify([{ foodItemId: "x", qty: 0 }]))).toEqual({ error: expect.any(String) });
  });
});

describe("lifecycle predicates", () => {
  it("editable only before approval/vendor handoff", () => {
    expect(isEditable("raised")).toBe(true);
    expect(isEditable("pending_approval")).toBe(true);
    expect(isEditable("vendor_accepted")).toBe(false);
    expect(isEditable("delivered")).toBe(false);
  });

  it("cancellable until a terminal state", () => {
    expect(isCancellable("preparing")).toBe(true);
    expect(isCancellable("delivered")).toBe(false);
    expect(isCancellable("rejected")).toBe(false);
    expect(isCancellable("cancelled")).toBe(false);
  });
});
