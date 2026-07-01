/**
 * Food-request domain logic (plan.md §15) — pure, testable, no DB. Covers the
 * human request code, catalog line pricing (CATALOG-ONLY: the charge + vendor
 * cost always come from the catalog and are snapshotted onto the request), the
 * status metadata used by the UI, and the lifecycle predicates the server actions
 * enforce. Money stays `Decimal` end-to-end; callers format at the render edge.
 */

import { Prisma } from "@prisma/client";
import type { FoodRequestStatus } from "@prisma/client";
import { z } from "zod";

const ZERO = new Prisma.Decimal(0);

/** Zero-padded human reference, derived from the row id once it exists. */
export function requestCode(id: bigint): string {
  return `FR-${id.toString().padStart(6, "0")}`;
}

// ---------------------------------------------------------------- line pricing

/** A catalog item as the pricer needs it (snapshot source). */
export type CatalogItem = {
  id: bigint;
  mealTypeId: bigint;
  unitPrice: Prisma.Decimal;
  unitVendorPrice: Prisma.Decimal;
  active: boolean;
};

export type LineInput = { foodItemId: bigint; qty: number; description: string | null };

export type PricedLine = {
  foodItemId: bigint;
  mealTypeId: bigint;
  qty: number;
  unitPrice: Prisma.Decimal;
  unitVendorPrice: Prisma.Decimal;
  description: string | null;
};

export type PricedRequest = {
  lines: PricedLine[];
  amount: Prisma.Decimal; // Σ qty × unitPrice (sale)
  vendorAmount: Prisma.Decimal; // Σ qty × unitVendorPrice (cost)
};

/**
 * Snapshot-price the requested lines against the catalog. Rejects unknown,
 * inactive, or non-positive lines so a request can never be created with a price
 * the catalog doesn't currently back. Returns Decimal totals.
 */
export function priceLines(
  lines: LineInput[],
  catalog: Map<string, CatalogItem>,
): PricedRequest | { error: string } {
  if (lines.length === 0) return { error: "Add at least one item." };

  const priced: PricedLine[] = [];
  let amount = ZERO;
  let vendorAmount = ZERO;

  for (const line of lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1) {
      return { error: "Each item needs a quantity of at least 1." };
    }
    const item = catalog.get(line.foodItemId.toString());
    if (!item) return { error: "One of the selected items is no longer in the catalog." };
    if (!item.active) return { error: "One of the selected items is inactive — pick a current item." };

    amount = amount.plus(item.unitPrice.mul(line.qty));
    vendorAmount = vendorAmount.plus(item.unitVendorPrice.mul(line.qty));
    priced.push({
      foodItemId: item.id,
      mealTypeId: item.mealTypeId,
      qty: line.qty,
      unitPrice: item.unitPrice,
      unitVendorPrice: item.unitVendorPrice,
      description: line.description,
    });
  }

  return { lines: priced, amount, vendorAmount };
}

// ---------------------------------------------------------------- status model

export type StatusMeta = { label: string; dot: string; text: string };

/** Display metadata per status (paired dot + label — never colour alone, a11y). */
export const FOOD_REQUEST_STATUS_META: Record<FoodRequestStatus, StatusMeta> = {
  raised: { label: "Raised", dot: "bg-muted-2", text: "text-muted" },
  pending_approval: { label: "Pending approval", dot: "bg-gold", text: "text-gold-deep" },
  approved: { label: "Approved", dot: "bg-sage", text: "text-sage-deep" },
  vendor_accepted: { label: "Vendor accepted", dot: "bg-sage", text: "text-sage-deep" },
  preparing: { label: "Preparing", dot: "bg-gold", text: "text-gold-deep" },
  out_for_delivery: { label: "Out for delivery", dot: "bg-gold", text: "text-gold-deep" },
  delivered: { label: "Delivered", dot: "bg-sage", text: "text-sage-deep" },
  rejected: { label: "Rejected", dot: "bg-tomato", text: "text-tomato" },
  cancelled: { label: "Cancelled", dot: "bg-muted-2", text: "text-muted" },
};

/** Terminal states never transition further. */
export const TERMINAL_STATUSES: readonly FoodRequestStatus[] = ["delivered", "rejected", "cancelled"];

/** Admin may edit a request only before approval/vendor handoff. */
export function isEditable(status: FoodRequestStatus): boolean {
  return status === "raised" || status === "pending_approval";
}

/** Admin may cancel any request that hasn't reached a terminal state. */
export function isCancellable(status: FoodRequestStatus): boolean {
  return !TERMINAL_STATUSES.includes(status);
}

// ---------------------------------------------------------------- vendor flow

/** Statuses where the vendor must decide to accept or reject. */
export const VENDOR_ACTIONABLE: readonly FoodRequestStatus[] = ["raised", "approved"];

/** Statuses the vendor is actively working (accepted → out for delivery). */
export const VENDOR_IN_PROGRESS: readonly FoodRequestStatus[] = ["vendor_accepted", "preparing", "out_for_delivery"];

/** The vendor may accept/reject only before they've taken the order on. */
export function vendorCanDecide(status: FoodRequestStatus): boolean {
  return VENDOR_ACTIONABLE.includes(status);
}

/**
 * The next plain (non-delivery) status a vendor can advance to. Delivery
 * (out_for_delivery → delivered) is NOT here — it's gated by an RFID tap.
 */
export function vendorAdvanceTarget(status: FoodRequestStatus): FoodRequestStatus | null {
  switch (status) {
    case "vendor_accepted":
      return "preparing";
    case "preparing":
      return "out_for_delivery";
    default:
      return null;
  }
}

/** Whether the request is at the delivery step (RFID-gated, Phase E). */
export function isAwaitingDelivery(status: FoodRequestStatus): boolean {
  return status === "out_for_delivery";
}

// ---------------------------------------------------------------- input schema

/** One requested line as the create/edit form submits it (in the `items` JSON). */
export const lineSchema = z.object({
  foodItemId: z.string().regex(/^\d+$/, "Invalid item."),
  qty: z.number().int().min(1).max(999),
  description: z.string().trim().max(255).optional().nullable(),
});

/** The create/edit payload after the form's `items` field is JSON-parsed. */
export const foodRequestSchema = z.object({
  userId: z.string().regex(/^\d+$/, "Pick a cardholder."),
  vendorId: z.string().regex(/^\d+$/).optional().nullable(),
  deliveryLocation: z.string().trim().min(1, "Delivery location is required.").max(150),
  requestedFor: z.string().min(1, "Pick a delivery date & time."),
  purpose: z.string().trim().max(255).optional().nullable(),
  items: z.array(lineSchema).min(1, "Add at least one item."),
});

export type FoodRequestInput = z.infer<typeof foodRequestSchema>;

// ---------------------------------------------------------------- approval

/** Single-step approval config, stored in `settings.food_request_approval`. */
export type ApprovalConfig = {
  enabled: boolean;
  autoApproveBelow: number | null; // amount strictly below this auto-skips approval; null = always require
  approverPermission: string;
};

export const DEFAULT_APPROVAL_CONFIG: ApprovalConfig = {
  enabled: false,
  autoApproveBelow: null,
  approverPermission: "foodRequests.approve",
};

/** Coerce the stored JSON setting into a safe config (defaults on anything odd). */
export function parseApprovalConfig(value: unknown): ApprovalConfig {
  const v = (value ?? {}) as Record<string, unknown>;
  const below = v.autoApproveBelow;
  return {
    enabled: v.enabled === true,
    autoApproveBelow: typeof below === "number" && below >= 0 ? below : null,
    approverPermission:
      typeof v.approverPermission === "string" && v.approverPermission
        ? v.approverPermission
        : DEFAULT_APPROVAL_CONFIG.approverPermission,
  };
}

/**
 * Decide a new request's starting state from the approval config + its total.
 * Approval off, or total below the auto-approve threshold → `raised` (vendor can
 * accept). Otherwise → `pending_approval` (waits for an approver).
 */
export function resolveInitialStatus(
  config: ApprovalConfig,
  amount: Prisma.Decimal,
): { status: FoodRequestStatus; approvalRequired: boolean } {
  if (!config.enabled) return { status: "raised", approvalRequired: false };
  if (config.autoApproveBelow !== null && amount.lessThan(config.autoApproveBelow)) {
    return { status: "raised", approvalRequired: false };
  }
  return { status: "pending_approval", approvalRequired: true };
}

/** Parse the raw `items` JSON string from the form into typed lines (or throw-safe). */
export function parseItemsJson(raw: string): LineInput[] | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: "Could not read the item list." };
  }
  const parsed = z.array(lineSchema).safeParse(data);
  if (!parsed.success) return { error: "Add at least one valid item." };
  return parsed.data.map((l) => ({
    foodItemId: BigInt(l.foodItemId),
    qty: l.qty,
    description: l.description?.trim() ? l.description.trim() : null,
  }));
}
