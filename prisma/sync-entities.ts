/**
 * Sync the email sending entities (Pallavi / DPS) into the DB — idempotent.
 *
 * Mirrors the seed's entity block for databases that were seeded BEFORE the
 * notifications module existed: upserts the two entities and maps any branch
 * that has no entity yet (Gandipet/PIS → Pallavi, everything else → DPS).
 * Branches that are already mapped are left untouched, as are the entities'
 * from-name/from-email if the rows exist (edit those in Notifications → Email
 * → Entities & branches).
 *
 * Usage (on the server, with the production DATABASE_URL in the environment):
 *   npm run db:sync-entities
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const pallavi = await prisma.emailEntity.upsert({
    where: { name: "Pallavi" },
    update: {},
    create: { name: "Pallavi", fromName: "Pallavi Group of Institutions", fromEmail: "noreply@pallavi.edu.in", envPrefix: "PALLAVI" },
  });
  const dps = await prisma.emailEntity.upsert({
    where: { name: "DPS" },
    update: {},
    create: { name: "DPS", fromName: "Delhi Public School", fromEmail: "noreply@dps.edu.in", envPrefix: "DPS" },
  });

  const unmapped = await prisma.branch.findMany({ where: { emailEntityId: null, deletedAt: null } });
  for (const b of unmapped) {
    const isPallavi = /gandipet|\bpis\b/i.test(`${b.code} ${b.name}`);
    await prisma.branch.update({
      where: { id: b.id },
      data: { emailEntityId: isPallavi ? pallavi.id : dps.id },
    });
    console.log(`Mapped ${b.code} (${b.name}) → ${isPallavi ? "Pallavi" : "DPS"}`);
  }

  console.log(`Entities synced — Pallavi #${pallavi.id}, DPS #${dps.id}; ${unmapped.length} branch(es) newly mapped.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
