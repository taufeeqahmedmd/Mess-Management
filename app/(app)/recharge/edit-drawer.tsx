"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { XGlyph } from "@/components/ui/glyphs";
import { RechargeForm, type RechargeInitial } from "./recharge-form";
import { createRechargeAction, editRechargeAction } from "./actions";

type DrawerData = {
  userId: string;
  userName: string;
  rechargeId?: string;
  meals: { id: string; name: string }[];
  rates: Record<string, string>;
  paymentModes: { id: string; name: string }[];
  initial?: RechargeInitial;
};

/**
 * Recharge slide-in drawer (create + edit). Opens on click of:
 *   • `data-recharge-user="<userId>"`  → new recharge for that cardholder
 *   • `data-edit-recharge="<id>"`      → edit an existing recharge
 * Fetches the form data, then hosts <RechargeForm> wired to the create/edit
 * server action (both redirect to /recharge?flash=… on save, closing the drawer
 * + refreshing the list). Money logic lives entirely in those actions.
 */
export function RechargeDrawer() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DrawerData | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function close() {
    setOpen(false);
  }

  // Save actions redirect to /recharge?flash=… (often the same path the drawer is
  // mounted on, so it isn't unmounted). Close on any navigation change.
  const navKey = `${pathname}?${searchParams.toString()}`;
  useEffect(() => {
    // Sync to navigation: any route change (incl. the post-save redirect) closes it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [navKey]);

  useEffect(() => {
    async function load(url: string, m: "create" | "edit") {
      setMode(m);
      setOpen(true);
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Couldn’t load this recharge.");
        } else {
          setData(await res.json());
        }
      } catch {
        setError("Couldn’t load this recharge.");
      } finally {
        setLoading(false);
      }
    }

    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      const create = t?.closest<HTMLElement>("[data-recharge-user]");
      if (create) {
        e.preventDefault();
        void load(`/api/recharges/new?userId=${create.dataset.rechargeUser}`, "create");
        return;
      }
      const edit = t?.closest<HTMLElement>("[data-edit-recharge]");
      if (edit) {
        e.preventDefault();
        void load(`/api/recharges/${edit.dataset.editRecharge}/edit`, "edit");
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isEdit = mode === "edit";

  return (
    <>
      <div
        aria-hidden={!open}
        onClick={close}
        className={`fixed inset-0 z-[60] bg-ink/45 backdrop-blur-sm transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit recharge" : "New recharge"}
        className={`fixed inset-y-0 right-0 z-[61] flex h-screen w-[520px] max-w-full flex-col border-l border-line bg-surface shadow-lg transition-transform duration-[240ms] ease-[cubic-bezier(.4,0,.2,1)] ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-start gap-3 border-b border-line px-6 py-4">
          <span className="h-9 w-1 shrink-0 rounded-full bg-gold" />
          <div className="min-w-0">
            <div className="text-[11.5px] text-muted-2">Recharge · {isEdit ? "Edit" : "New"}</div>
            <div className="truncate font-display text-[18px] font-bold tracking-[-0.3px] text-ink">
              {data ? `${isEdit ? "Edit recharge" : "Recharge"} — ${data.userName}` : isEdit ? "Edit recharge" : "New recharge"}
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="ml-auto grid size-8 shrink-0 place-items-center rounded-pill border border-line-strong text-muted transition-colors hover:bg-gold-soft hover:text-gold-deep">
            <XGlyph className="size-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : error ? (
            <p role="alert" className="rounded-sm border border-tomato/30 bg-tomato-soft px-3 py-2.5 text-[12.5px] font-medium text-tomato">{error}</p>
          ) : data ? (
            <RechargeForm
              key={`${mode}:${data.rechargeId ?? data.userId}`}
              action={isEdit ? editRechargeAction : createRechargeAction}
              userId={data.userId}
              userName={data.userName}
              rechargeId={data.rechargeId}
              initial={data.initial}
              meals={data.meals}
              rates={data.rates}
              paymentModes={data.paymentModes}
              onCancel={close}
            />
          ) : null}
        </div>
      </aside>
    </>
  );
}
