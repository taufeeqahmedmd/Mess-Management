"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "./toast";

/**
 * Surfaces a success toast after a redirecting server action (create/edit).
 * Those actions can't toast themselves — they redirect — so they append
 * `?flash=<code>` to the destination, and this component (mounted once in the
 * app shell) shows the matching toast then strips the param from the URL.
 */
const MESSAGES: Record<string, string> = {
  created: "Created successfully.",
  updated: "Changes saved.",
  deleted: "Deleted.",
  saved: "Saved.",
};

export function FlashToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const handled = useRef(false);
  const flash = params.get("flash");

  useEffect(() => {
    if (!flash) {
      handled.current = false;
      return;
    }
    if (handled.current) return;
    handled.current = true;

    toast.success(MESSAGES[flash] ?? "Done.");

    const next = new URLSearchParams(params);
    next.delete("flash");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [flash, params, pathname, router, toast]);

  return null;
}
