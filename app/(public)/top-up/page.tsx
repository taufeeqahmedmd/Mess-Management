import type { Metadata } from "next";
import { LookupClient } from "./lookup-client";

export const metadata: Metadata = {
  title: "Check your balance · Mess Management",
};

/**
 * Public self-service lookup (plan.md §7 #12). Unauthenticated; talks only to the
 * rate-limited /api/public/* route handlers. No app shell — standalone page.
 */
export default function LookupPage() {
  return <LookupClient />;
}
