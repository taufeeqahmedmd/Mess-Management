import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireActor } from "@/lib/session";
import { Icon } from "@/components/shell/icons";
import { searchEntities } from "@/services/search";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requireActor();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const groups = q ? await searchEntities(prisma, actor, q) : [];
  const totalResults = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-5 sm:px-8 sm:py-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Search</h1>
        <p className="mt-1 text-sm text-ink-2">
          {q
            ? `${totalResults} result${totalResults === 1 ? "" : "s"} for “${q}”`
            : "Find cardholders, staff, counters, and vendors."}
        </p>
      </div>

      <form method="get" action="/search" role="search" className="flex gap-2">
        <label htmlFor="q" className="sr-only">Search</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          autoFocus
          enterKeyHint="search"
          placeholder="Search cardholders, staff, counters, vendors…"
          className="w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-gold focus:outline-none focus-visible:ring-3 focus-visible:ring-gold/20"
        />
        <button
          type="submit"
          className="rounded-sm bg-gold px-5 py-2.5 text-sm font-semibold text-ink shadow-gold transition-colors hover:bg-gold-deep"
        >
          Search
        </button>
      </form>

      {!q ? (
        <div className="rounded-md border border-line bg-surface-2 p-6 text-sm text-ink-2">
          Type a name, ID, mobile, card UID, or code to search across the app. Results are limited to
          what your role and branch can see.
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-md border border-line bg-surface-2 p-6 text-center text-sm text-ink-2">
          No matches for “{q}”. Try a different name, ID, or code.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key} className="rounded-md border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
                  <Icon name={group.icon} className="size-[18px] text-gold-deep" />
                  {group.label}
                  <span className="font-mono text-xs font-normal text-muted">{group.items.length}</span>
                </h2>
                <Link
                  href={group.more.href}
                  className="text-xs font-medium text-ink-2 transition-colors hover:text-gold-deep"
                >
                  {group.more.label} →
                </Link>
              </div>
              <ul className="divide-y divide-line">
                {group.items.map((item) => (
                  <li key={`${group.key}-${item.id}`}>
                    <Link
                      href={item.href}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-gold/5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                        <span className="block truncate text-xs text-ink-2">{item.subtitle}</span>
                      </span>
                      {item.code ? (
                        <span className="shrink-0 font-mono text-xs text-muted">{item.code}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
