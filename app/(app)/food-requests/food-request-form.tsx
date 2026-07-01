"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useConfirmedAction } from "@/components/ui/use-confirmed-action";
import { BTN_PRIMARY, BTN_GHOST, FORM_LABEL, FORM_INPUT, FORM_OPT } from "@/components/ui/controls";
import type { FoodRequestFormState } from "./actions";

export type CatalogOption = { id: string; name: string; kind: string; unitPrice: string };
export type VendorOption = { id: string; name: string };
type Action = (prev: FoodRequestFormState, formData: FormData) => Promise<FoodRequestFormState>;

type Row = { key: string; foodItemId: string; qty: number; description: string };

export type FoodRequestInitial = {
  vendorId: string;
  deliveryLocation: string;
  requestedFor: string; // "" or value for <input type=datetime-local>
  purpose: string;
  items: { foodItemId: string; qty: number; description: string }[];
};

const initialState: FoodRequestFormState = {};

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let rowSeq = 0;
const newRow = (init?: Partial<Row>): Row => ({
  key: `r${rowSeq++}`,
  foodItemId: init?.foodItemId ?? "",
  qty: init?.qty ?? 1,
  description: init?.description ?? "",
});

/**
 * Food-request create/edit form (plan.md §15). Picks catalog items with qty
 * steppers and a live total, a delivery location + date/time, an optional vendor
 * and purpose. CATALOG-ONLY: the total shown is informational — the server
 * re-prices from the catalog on submit. Used by /food-requests/new and /[id]/edit.
 */
export function FoodRequestForm({
  action,
  userId,
  userName,
  catalog,
  vendors,
  requestId,
  initial,
  onCancel,
}: {
  action: Action;
  userId: string;
  userName: string;
  catalog: CatalogOption[];
  vendors: VendorOption[];
  requestId?: string;
  initial?: FoodRequestInitial;
  onCancel?: () => void;
}) {
  const isEdit = Boolean(requestId);
  const priceById = useMemo(() => new Map(catalog.map((c) => [c.id, Number.parseFloat(c.unitPrice)])), [catalog]);
  const kindById = useMemo(() => new Map(catalog.map((c) => [c.id, c.kind])), [catalog]);

  const [rows, setRows] = useState<Row[]>(() =>
    initial && initial.items.length > 0
      ? initial.items.map((i) => newRow({ foodItemId: i.foodItemId, qty: i.qty, description: i.description }))
      : [newRow()],
  );

  const { state, onSubmit, pending } = useConfirmedAction(action, initialState, {
    confirm: {
      title: isEdit ? "Confirm changes" : "Confirm request",
      message: isEdit ? `Save changes to this request for ${userName}?` : `Raise this food request for ${userName}?`,
      confirmLabel: isEdit ? "Yes, save" : "Yes, raise request",
      tone: "default",
    },
  });

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, newRow()]);
  const removeRow = (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  const lineTotal = (r: Row) => (priceById.get(r.foodItemId) ?? 0) * (r.qty || 0);
  const total = rows.reduce((s, r) => s + lineTotal(r), 0);

  // Serialised payload the server re-validates + re-prices.
  const itemsJson = JSON.stringify(
    rows
      .filter((r) => r.foodItemId && r.qty > 0)
      .map((r) => ({ foodItemId: r.foodItemId, qty: r.qty, description: r.description.trim() || null })),
  );

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="items" value={itemsJson} />
      {requestId ? <input type="hidden" name="requestId" value={requestId} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">
          {state.error}
        </p>
      ) : null}

      {/* Items */}
      <div>
        <span className={FORM_LABEL}>Items</span>
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => {
            const isCustom = kindById.get(r.foodItemId) === "custom";
            const line = lineTotal(r);
            return (
              <div key={r.key} className="rounded-[12px] border border-line bg-surface p-[12px_13px]">
                <div className="flex flex-wrap items-end gap-2.5">
                  <div className="min-w-[180px] flex-1">
                    <label className="mb-1 block text-[10.5px] font-semibold text-muted-2">Item</label>
                    <select
                      value={r.foodItemId}
                      onChange={(e) => setRow(r.key, { foodItemId: e.target.value })}
                      aria-label="Item"
                      className={FORM_INPUT}
                    >
                      <option value="" disabled>Select an item…</option>
                      {catalog.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {inr(Number.parseFloat(c.unitPrice))}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-[88px]">
                    <label className="mb-1 block text-[10.5px] font-semibold text-muted-2">Qty</label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      inputMode="numeric"
                      value={r.qty}
                      onChange={(e) => setRow(r.key, { qty: Math.max(1, Number.parseInt(e.target.value || "1", 10) || 1) })}
                      aria-label="Quantity"
                      className={`${FORM_INPUT} text-center font-mono tabular-nums`}
                    />
                  </div>
                  <div className="w-[92px] shrink-0 pb-2.5 text-right">
                    <span className={`font-mono text-[13px] font-semibold tabular-nums ${line === 0 ? "text-muted-2" : "text-gold-deep"}`}>
                      {inr(line)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(r.key)}
                    disabled={rows.length === 1}
                    aria-label="Remove item"
                    className="mb-1 grid size-9 place-items-center rounded-sm border border-line-strong text-muted transition-colors hover:border-tomato/40 hover:bg-tomato-soft hover:text-tomato disabled:opacity-40 disabled:hover:border-line-strong disabled:hover:bg-transparent disabled:hover:text-muted"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
                {isCustom ? (
                  <input
                    value={r.description}
                    onChange={(e) => setRow(r.key, { description: e.target.value })}
                    maxLength={255}
                    placeholder="Describe the custom item…"
                    aria-label="Custom item description"
                    className={`${FORM_INPUT} mt-2.5`}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <button type="button" onClick={addRow} className={`${BTN_GHOST} mt-2.5`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="size-4"><path d="M12 5v14M5 12h14" /></svg>
          Add item
        </button>
      </div>

      <div className="flex items-center justify-between rounded-[12px] border border-gold-soft-2 bg-gold-soft px-4 py-3">
        <span className="text-[12.5px] font-medium text-gold-deep">Estimated charge (catalog price)</span>
        <span className="font-display text-xl font-bold tabular-nums text-gold-deep">{inr(total)}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="deliveryLocation" className={FORM_LABEL}>Delivery location</label>
          <input id="deliveryLocation" name="deliveryLocation" required maxLength={150} defaultValue={initial?.deliveryLocation ?? ""} placeholder="e.g. Block A — Conference Room" className={FORM_INPUT} />
        </div>
        <div>
          <label htmlFor="requestedFor" className={FORM_LABEL}>Delivery date &amp; time</label>
          <input id="requestedFor" name="requestedFor" type="datetime-local" required defaultValue={initial?.requestedFor ?? ""} className={FORM_INPUT} />
        </div>
        <div>
          <label htmlFor="vendorId" className={FORM_LABEL}>Vendor <span className={FORM_OPT}>(optional)</span></label>
          <select id="vendorId" name="vendorId" defaultValue={initial?.vendorId ?? ""} className={FORM_INPUT}>
            <option value="">Unassigned</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="purpose" className={FORM_LABEL}>Remarks / purpose <span className={FORM_OPT}>(optional)</span></label>
          <input id="purpose" name="purpose" maxLength={255} defaultValue={initial?.purpose ?? ""} placeholder="Add a note…" className={FORM_INPUT} />
        </div>
      </div>

      <p className="rounded-sm border border-line bg-surface-2 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-2">
        The cardholder&rsquo;s wallet is only charged at delivery, after an RFID tap confirms the card.
        The amount above is the current catalog estimate and is re-priced server-side.
      </p>

      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Raise request"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={BTN_GHOST}>Cancel</button>
        ) : (
          <Link href="/food-requests" className={BTN_GHOST}>Cancel</Link>
        )}
      </div>
    </form>
  );
}
