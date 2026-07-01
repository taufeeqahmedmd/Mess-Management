"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { XGlyph } from "@/components/ui/glyphs";
import { BranchForm, type BranchData } from "./branches/branch-form";
import { CategoryForm, type CategoryData } from "./categories/category-form";
import { MealForm, type MealData } from "./meals/meal-form";
import { StaffForm, type StaffData } from "./staff/staff-form";
import { createBranchAction, updateBranchAction } from "./branches/actions";
import { createCategoryAction, updateCategoryAction } from "./categories/actions";
import { createMealAction, updateMealAction } from "./meals/actions";
import { createStaffAction, updateStaffAction } from "./staff/actions";

type Entity = "branches" | "categories" | "meals" | "staff";
const LABEL: Record<Entity, string> = { branches: "branch", categories: "category", meals: "meal", staff: "staff member" };
const ENTITIES: Entity[] = ["branches", "categories", "meals", "staff"];

/**
 * Settings Add/Edit slide-in drawer for the simple master-data entities
 * (branch / category / meal / staff). Triggers:
 *   • `data-settings-add="<entity>"`               → create
 *   • `data-settings-edit="<entity>" data-settings-id="<id>"` → edit (fetches the record)
 * Staff also fetches role/branch/counter options on create. Hosts the matching
 * *Form wired to the create/update server actions (which redirect to
 * /settings/<entity>?flash=… on save, closing the drawer).
 */
export function SettingsDrawer() {
  const [open, setOpen] = useState(false);
  const [entity, setEntity] = useState<Entity>("branches");
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const close = () => setOpen(false);

  // Save actions redirect to /settings/<entity>?flash=… (under the persistent
  // settings layout, so the drawer isn't unmounted). Close on navigation change.
  const navKey = `${pathname}?${searchParams.toString()}`;
  useEffect(() => {
    // Sync to navigation: any route change (incl. the post-save redirect) closes it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [navKey]);

  useEffect(() => {
    function isEntity(v: string | undefined): v is Entity {
      return v != null && (ENTITIES as string[]).includes(v);
    }
    async function load(ent: Entity, m: "create" | "edit", id?: string) {
      setEntity(ent);
      setMode(m);
      setData(null);
      setError(null);
      setOpen(true);
      // branch/category/meal create needs no server data; everything else fetches.
      const needsFetch = m === "edit" || ent === "staff";
      if (!needsFetch) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const url = ent === "staff" ? `/api/settings/staff${id ? `?id=${id}` : ""}` : `/api/settings/${ent}/${id}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Couldn’t load this record.");
        } else {
          setData(await res.json());
        }
      } catch {
        setError("Couldn’t load this record.");
      } finally {
        setLoading(false);
      }
    }

    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      const add = t?.closest<HTMLElement>("[data-settings-add]");
      if (add && isEntity(add.dataset.settingsAdd)) {
        e.preventDefault();
        void load(add.dataset.settingsAdd, "create");
        return;
      }
      const edit = t?.closest<HTMLElement>("[data-settings-edit]");
      if (edit && isEntity(edit.dataset.settingsEdit) && edit.dataset.settingsId) {
        e.preventDefault();
        void load(edit.dataset.settingsEdit, "edit", edit.dataset.settingsId);
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
  // staff always needs its fetched options before rendering; others only on edit.
  const ready = isEdit || entity === "staff" ? Boolean(data) : true;
  const name = (data?.name as string | undefined) ?? ((data?.staff as { name?: string } | undefined)?.name ?? "");

  function renderForm() {
    const key = `${entity}:${mode}:${(data?.id as string) ?? (data?.staff as { id?: string } | undefined)?.id ?? "new"}`;
    if (entity === "branches")
      return <BranchForm key={key} action={isEdit ? updateBranchAction : createBranchAction} branch={isEdit ? (data as unknown as BranchData) : undefined} onCancel={close} />;
    if (entity === "categories")
      return <CategoryForm key={key} action={isEdit ? updateCategoryAction : createCategoryAction} category={isEdit ? (data as unknown as CategoryData) : undefined} onCancel={close} />;
    if (entity === "meals")
      return <MealForm key={key} action={isEdit ? updateMealAction : createMealAction} meal={isEdit ? (data as unknown as MealData) : undefined} onCancel={close} />;
    const d = data as {
      roles: { id: string; name: string }[];
      branches: { id: string; name: string }[];
      counters: { id: string; name: string }[];
      vendors: { id: string; name: string }[];
      canChooseBranch: boolean;
      staff?: StaffData;
      assignedCounterIds?: string[];
    };
    return (
      <StaffForm
        key={key}
        action={isEdit ? updateStaffAction : createStaffAction}
        staff={isEdit ? d.staff : undefined}
        roles={d.roles}
        branches={d.branches}
        counters={d.counters}
        vendors={d.vendors}
        assignedCounterIds={d.assignedCounterIds ?? []}
        canChooseBranch={d.canChooseBranch}
        onCancel={close}
      />
    );
  }

  const wide = entity === "staff";

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
        aria-label={`${isEdit ? "Edit" : "New"} ${LABEL[entity]}`}
        className={`fixed inset-y-0 right-0 z-[61] flex h-screen ${wide ? "w-[560px]" : "w-[520px]"} max-w-full flex-col border-l border-line bg-surface shadow-lg transition-transform duration-[240ms] ease-[cubic-bezier(.4,0,.2,1)] ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-start gap-3 border-b border-line px-6 py-4">
          <span className="h-9 w-1 shrink-0 rounded-full bg-gold" />
          <div className="min-w-0">
            <div className="text-[11.5px] capitalize text-muted-2">{entity} · {isEdit ? "Edit" : "New"}</div>
            <div className="truncate font-display text-[18px] font-bold capitalize tracking-[-0.3px] text-ink">
              {isEdit ? `Edit ${LABEL[entity]}${name ? ` — ${name}` : ""}` : `New ${LABEL[entity]}`}
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
            renderForm()
          ) : null}
        </div>
      </aside>
    </>
  );
}
