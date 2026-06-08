import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Append an audit_log row (plan.md §10 — every state change is traceable).
 * Pass a transaction client `db` to write the audit inside the same
 * `$transaction` as the mutation. `before`/`after` must be JSON-serializable
 * (convert BigInt ids to strings).
 */
export async function writeAudit(
  params: {
    appUserId?: bigint | null;
    action: string;
    entity: string;
    entityId?: bigint | null;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  },
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
    userAgent = h.get("user-agent") ?? null;
  } catch {
    // headers() is only available in a request scope — ignore otherwise.
  }

  await db.auditLog.create({
    data: {
      appUserId: params.appUserId ?? null,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      beforeJson: params.before,
      afterJson: params.after,
      ip,
      userAgent,
    },
  });
}
