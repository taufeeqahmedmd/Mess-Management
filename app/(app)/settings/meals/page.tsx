import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { setMealActiveAction } from "./actions";

export default async function MealsPage() {
  const actor = await requireActor();
  if (!can(actor, "meals.manage")) redirect("/dashboard");

  const meals = await prisma.mealType.findMany({ orderBy: { startTime: "asc" } });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted">
            <Link href="/settings" className="hover:text-gold-deep">Configurations</Link> / Meals
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">Meals</h1>
          <p className="mt-1 text-sm text-ink-2">Meal types and their active time windows.</p>
        </div>
        <Link href="/settings/meals/new" className="rounded-sm bg-gold px-4 py-2.5 font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep">
          Add meal
        </Link>
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Window</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {meals.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-2">No meals yet. Add the first one.</td>
              </tr>
            ) : (
              meals.map((m) => (
                <tr key={m.id.toString()} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-ink">{m.code}</td>
                  <td className="px-4 py-3 text-ink">{m.name}</td>
                  <td className="px-4 py-3 font-mono text-ink-2">{m.startTime}&ndash;{m.endTime}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <span className={`size-2 rounded-pill ${m.active ? "bg-sage" : "bg-muted-2"}`} />
                      {m.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/settings/meals/${m.id}/edit`} className="rounded-sm px-2.5 py-1.5 text-xs font-medium text-gold-deep transition-colors hover:bg-gold/10">Edit</Link>
                      <form action={setMealActiveAction}>
                        <input type="hidden" name="id" value={m.id.toString()} />
                        <input type="hidden" name="active" value={m.active ? "false" : "true"} />
                        <button type="submit" className="rounded-sm px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-gold/10 hover:text-gold-deep">
                          {m.active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
