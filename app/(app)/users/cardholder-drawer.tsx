"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { XGlyph } from "@/components/ui/glyphs";
import { UserForm, type UserData } from "./user-form";
import { createUserAction, updateUserAction } from "./actions";

type Cat = { id: string; name: string; identifierLabel: string; identifierRequired: boolean; contactRequired: boolean };
type Option = { id: string; name: string };

/**
 * Add / Edit cardholder slide-in drawer. Opens on click of any element with
 * `data-add-cardholder` (create) or `data-edit-user="<id>"` (edit). Edit fetches
 * current values; both host <UserForm> wired to the create/update server actions
 * (which redirect to /users?flash=… on save — closing the drawer). Categories /
 * departments / branches are passed from the page (no extra round-trip on add).
 */
export function CardholderDrawer({
  categories,
  departments,
  branches,
  canChooseBranch,
}: {
  categories: Cat[];
  departments: Option[];
  branches: Option[];
  canChooseBranch: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [nonce, setNonce] = useState(0);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function close() {
    setOpen(false);
  }

  // create/updateUserAction redirect to /users?flash=… (same path the drawer is
  // mounted on). Close on any navigation change so the drawer doesn't linger.
  const navKey = `${pathname}?${searchParams.toString()}`;
  useEffect(() => {
    // Sync to navigation: any route change (incl. the post-save redirect) closes it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [navKey]);

  useEffect(() => {
    async function openEdit(id: string) {
      setMode("edit");
      setUser(null);
      setError(null);
      setLoading(true);
      setOpen(true);
      setNonce((n) => n + 1);
      try {
        const res = await fetch(`/api/users/${id}/edit`);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Couldn’t load this cardholder.");
        } else {
          setUser(await res.json());
        }
      } catch {
        setError("Couldn’t load this cardholder.");
      } finally {
        setLoading(false);
      }
    }
    function openCreate() {
      setMode("create");
      setUser(null);
      setError(null);
      setLoading(false);
      setOpen(true);
      setNonce((n) => n + 1);
    }
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      const edit = t?.closest<HTMLElement>("[data-edit-user]");
      if (edit) {
        e.preventDefault();
        void openEdit(edit.dataset.editUser!);
        return;
      }
      if (t?.closest("[data-add-cardholder]")) {
        e.preventDefault();
        openCreate();
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
  const ready = isEdit ? Boolean(user) : true;

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
        aria-label={isEdit ? "Edit cardholder" : "New cardholder"}
        className={`fixed inset-y-0 right-0 z-[61] flex h-screen w-[560px] max-w-full flex-col border-l border-line bg-surface shadow-lg transition-transform duration-[240ms] ease-[cubic-bezier(.4,0,.2,1)] ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-start gap-3 border-b border-line px-6 py-4">
          <span className="h-9 w-1 shrink-0 rounded-full bg-gold" />
          <div className="min-w-0">
            <div className="text-[11.5px] text-muted-2">Cardholders · {isEdit ? "Edit" : "New"}</div>
            <div className="truncate font-display text-[18px] font-bold tracking-[-0.3px] text-ink">
              {isEdit ? (user ? `Edit cardholder — ${user.fullName}` : "Edit cardholder") : "New cardholder"}
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
          ) : ready ? (
            <UserForm
              key={nonce}
              action={isEdit ? updateUserAction : createUserAction}
              user={isEdit ? user! : undefined}
              categories={categories}
              departments={departments}
              branches={branches}
              canChooseBranch={canChooseBranch}
              onCancel={close}
            />
          ) : null}
        </div>
      </aside>
    </>
  );
}
