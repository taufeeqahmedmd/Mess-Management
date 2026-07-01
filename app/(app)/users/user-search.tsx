"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { INPUT_FIND } from "@/components/ui/controls";

/**
 * Live search for the cardholders table. Typing debounces a soft navigation to
 * /users?q=… (no Search button, no full-page reload) so the server-rendered table
 * re-filters as you type. The input stays mounted across the soft nav, so focus
 * and caret are preserved. `initialQ` seeds it from the current URL.
 */
export function UserSearch({ initialQ }: { initialQ: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const firstRun = useRef(true);

  useEffect(() => {
    // Don't re-navigate on mount (the URL already reflects `initialQ`).
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const term = q.trim();
      // Dropping `page`/`size` resets to the first page of results for a new query.
      router.replace(term ? `/users?q=${encodeURIComponent(term)}` : "/users", { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [q, router]);

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by id, name, phone, email, card UID…"
        aria-label="Search cardholders"
        autoComplete="off"
        className={`${INPUT_FIND} sm:max-w-[420px]`}
      />
      {q ? (
        <button
          type="button"
          onClick={() => setQ("")}
          className="inline-flex items-center px-3 text-[13px] font-medium text-muted transition-colors hover:text-ink-2"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
