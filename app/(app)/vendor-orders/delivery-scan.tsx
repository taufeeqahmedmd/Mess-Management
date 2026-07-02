"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { BTN_PRIMARY, FORM_INPUT } from "@/components/ui/controls";

type Result = { status: "DELIVERED" | "REJECTED"; reason: string; charged?: string; cardholder?: { name: string; code: string } };

/**
 * Delivery confirmation by RFID. The USB/Bluetooth reader is a keyboard wedge —
 * it types the card UID + Enter into the focused input (same capture model as the
 * counter). The delivery is recorded server-side only after the tap verifies the
 * card belongs to the request's cardholder. One idempotency token per mount, so a
 * network retry can't double-post. Coupon-only: the cardholder is not charged.
 */
export function DeliveryScan({ requestId }: { requestId: string }) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cardUid, setCardUid] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [clientTxId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit() {
    const uid = cardUid.trim();
    if (!uid || pending) return;
    setPending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/food-requests/${requestId}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardUid: uid, clientTxId }),
      });
      const data = (await res.json()) as Result & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Delivery failed.");
        setPending(false);
        return;
      }
      setResult(data);
      if (data.status === "DELIVERED") {
        toast.success("Delivered — RFID verified.");
        router.refresh();
      } else {
        toast.error(data.reason);
        setPending(false);
        setCardUid("");
        inputRef.current?.focus();
      }
    } catch {
      toast.error("Network error — try again.");
      setPending(false);
    }
  }

  if (result?.status === "DELIVERED") {
    return (
      <div className="rounded-[12px] border border-sage/40 bg-sage-soft p-[16px_18px]">
        <p className="text-[15px] font-bold text-sage-deep">✓ Delivered</p>
        <p className="mt-1 text-[13px] text-ink-2">
          Delivery to {result.cardholder?.name ?? "the cardholder"} confirmed by RFID.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-gold-soft-2 bg-gold-soft/60 p-[16px_18px]">
      <p className="mb-1 text-[13px] font-semibold text-gold-deep">Confirm delivery</p>
      <p className="mb-3 text-[12px] text-muted-2">
        Scan the cardholder&rsquo;s RFID card (or type the UID) to complete delivery. The delivery is
        recorded only after the card is verified.
      </p>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          ref={inputRef}
          value={cardUid}
          onChange={(e) => setCardUid(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Tap card / enter UID…"
          aria-label="Card UID"
          disabled={pending}
          className={`${FORM_INPUT} font-mono sm:max-w-[320px]`}
        />
        <button type="button" onClick={() => void submit()} disabled={pending || !cardUid.trim()} className={BTN_PRIMARY}>
          {pending ? "Confirming…" : "Confirm delivery"}
        </button>
      </div>
      {result?.status === "REJECTED" ? (
        <p role="alert" className="mt-2.5 text-[13px] font-semibold text-tomato">✗ {result.reason}</p>
      ) : null}
    </div>
  );
}
