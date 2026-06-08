import { NextResponse } from "next/server";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";

/** GET /api/users/sample — import template (header + one example row). */
export async function GET() {
  const actor = await getActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(actor, "users.import")) return new NextResponse("Forbidden", { status: 403 });

  // Import-relevant columns (branch comes from the actor's scope; wallet is not imported).
  const header = ["identifier", "fullName", "category", "phone", "email", "department", "status", "cardExpiry", "cardUid"];
  const example = ["ADM2024010", "Sample Student", "STU", "9810000010", "sample@example.com", "", "active", "2027-06-30", ""];

  const csv = toCsv([header, example]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cardholders-sample.csv"',
    },
  });
}
