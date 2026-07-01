"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { XGlyph, PlusGlyph } from "@/components/ui/glyphs";
import { BTN_PRIMARY } from "@/components/ui/controls";
import { FoodRequestForm, type CatalogOption, type VendorOption } from "./food-request-form";
import { createFoodRequestAction } from "./actions";

/**
 * "Raise request" trigger + slide-in drawer hosting the request form, defaulted
 * to the logged-in staff's linked cardholder (per the mock). Mirrors the recharge
 * drawer pattern; the create action redirects to /food-requests/[id] on save,
 * which closes the drawer via the navigation effect. "Change cardholder" routes
 * to the full picker page.
 */
export function RaiseDrawer({
  userId,
  userName,
  userCode,
  category,
  catalog,
  vendors,
  locations,
}: {
  userId: string;
  userName: string;
  userCode: string;
  category: string;
  catalog: CatalogOption[];
  vendors: VendorOption[];
  locations: string[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Close on any navigation (incl. the post-save redirect to the detail page).
  const navKey = `${pathname}?${searchParams.toString()}`;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [navKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={BTN_PRIMARY}>
        <PlusGlyph />
        Raise request
      </button>

      <div
        aria-hidden={!open}
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-[60] bg-ink/45 backdrop-blur-sm transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Raise food request"
        className={`fixed inset-y-0 right-0 z-[61] flex h-screen w-[560px] max-w-full flex-col border-l border-line bg-surface shadow-lg transition-transform duration-[240ms] ease-[cubic-bezier(.4,0,.2,1)] ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-start gap-3 border-b border-line px-6 py-4">
          <span className="h-9 w-1 shrink-0 rounded-full bg-gold" />
          <div className="min-w-0">
            <div className="text-[11.5px] text-muted-2">Food Requests · New</div>
            <div className="truncate font-display text-[18px] font-bold tracking-[-0.3px] text-ink">Request for {userName}</div>
            <div className="mt-1 text-[12px] text-muted-2">
              <span className="font-mono">{userCode}</span> · {category} · charged to this RFID account ·{" "}
              <Link href="/food-requests/new?pick=1" className="font-semibold text-gold-deep hover:underline">change cardholder</Link>
            </div>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="ml-auto grid size-8 shrink-0 place-items-center rounded-pill border border-line-strong text-muted transition-colors hover:bg-gold-soft hover:text-gold-deep">
            <XGlyph className="size-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {open ? (
            <FoodRequestForm
              action={createFoodRequestAction}
              userId={userId}
              userName={userName}
              catalog={catalog}
              vendors={vendors}
              locations={locations}
              onCancel={() => setOpen(false)}
            />
          ) : null}
        </div>
      </aside>
    </>
  );
}
