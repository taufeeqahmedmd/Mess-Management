import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/session";
import { can } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";
import { resolveDateRange } from "@/services/reporting";
import { auditKind, type AuditKind } from "@/lib/audit-kind";

const HEADER = ["when", "actor", "action", "kind", "entity", "entityId", "changed", "ip"];

function changedKeys(before: unknown, after: unknown): string[] {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  return [...keys].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
}

/** GET /api/reports/audit — branch-scoped audit CSV honouring the page filters (date, entity, action kind). */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(actor, "reports.view")) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k);
  const range = resolveDateRange(g("from") ?? undefined, g("to") ?? undefined, new Date());
  const branchId = actor.branchId ? BigInt(actor.branchId) : null;
  const entity = (g("entity") ?? "").trim();
  const kindRaw = g("kind") ?? "";
  const kind = (["create", "update", "delete", "security", "other"] as AuditKind[]).includes(kindRaw as AuditKind)
    ? (kindRaw as AuditKind)
    : undefined;

  const where: Prisma.AuditLogWhereInput = {
    createdAt: { gte: range.from, lt: range.toExclusive },
    ...(entity ? { entity } : {}),
    ...(branchId ? { appUser: { is: { branchId } } } : {}),
  };

  const rows = await prisma.auditLog.findMany({
    where,
    include: { appUser: true },
    orderBy: { id: "desc" },
    take: 50000,
  });

  const filtered = kind ? rows.filter((r) => auditKind(r.action) === kind) : rows;

  const body = filtered.map((r) => [
    r.createdAt.toISOString(),
    r.appUser?.name ?? "system",
    r.action,
    auditKind(r.action),
    r.entity,
    r.entityId != null ? r.entityId.toString() : "",
    changedKeys(r.beforeJson, r.afterJson).join(" | "),
    r.ip ?? "",
  ]);

  const csv = toCsv([HEADER, ...body]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit_${range.fromStr}_${range.toStr}.csv"`,
    },
  });
}
