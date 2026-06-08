import { NextResponse } from "next/server";

/** Liveness probe. Extended with a DB ping once the data layer is in use. */
export function GET() {
  return NextResponse.json({ status: "ok", service: "mess-management" });
}
