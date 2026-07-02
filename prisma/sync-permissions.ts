/**
 * Sync the permission catalog into the DB — idempotent.
 *
 * Creates any `permissions` rows that exist in the code catalog (lib/rbac
 * PERMISSIONS) but are missing in the database. Run this against a database that
 * was seeded before newer permission codes were added, so the Access Control
 * grid can persist grants for those permissions (see access-control/actions.ts).
 *
 * Safe to run repeatedly: `skipDuplicates` means existing rows are untouched and
 * nothing else in the schema is modified. Grants (rolePermission) are left as-is.
 *
 * Usage (on the server, with the production DATABASE_URL in the environment):
 *   npm run db:sync-permissions
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../lib/rbac";

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.permission.count();
  const result = await prisma.permission.createMany({
    data: PERMISSIONS.map((code) => ({ code, module: code.split(".")[0] })),
    skipDuplicates: true,
  });
  const after = await prisma.permission.count();
  console.log(
    `Permission catalog synced — ${result.count} created (${before} → ${after} total, ${PERMISSIONS.length} in catalog).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
