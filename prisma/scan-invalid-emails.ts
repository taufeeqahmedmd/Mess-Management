/**
 * Find (and optionally clear) cardholder emails that fail the strict email
 * check in `lib/contact.ts`. Older validation accepted "anything@anything.anything",
 * which let CSV rows with a phone number glued onto the email
 * ("x@gmail.com0744318010") through — and those went straight to the Jodo
 * payment payload, where they are rejected.
 *
 * Default is a dry run: prints every offending row. With --fix the bad value is
 * set to NULL (audited as `user.email_cleared`), so the top-up page asks the
 * payer for a fresh email instead of hiding the field. The original value is
 * kept in the audit row's `before` JSON for manual correction.
 *
 * Usage (on the server, with the production DATABASE_URL in the environment):
 *   npx tsx prisma/scan-invalid-emails.ts          # report only
 *   npx tsx prisma/scan-invalid-emails.ts --fix    # clear invalid emails
 */
import { PrismaClient } from "@prisma/client";
import { isValidEmail } from "../lib/contact";

const prisma = new PrismaClient();
const fix = process.argv.includes("--fix");

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { not: null }, deletedAt: null },
    select: { id: true, code: true, fullName: true, email: true, phone: true, branchId: true },
    orderBy: { id: "asc" },
  });
  const bad = users.filter((u) => !isValidEmail(u.email));

  console.log(`Checked ${users.length} cardholders with an email; ${bad.length} invalid.`);
  for (const u of bad) {
    console.log(`  #${u.id}  ${u.code}  ${u.fullName}  email="${u.email}"  phone=${u.phone ?? "-"}`);
  }
  if (!bad.length || !fix) {
    if (bad.length) console.log("\nDry run — re-run with --fix to clear these emails.");
    return;
  }

  for (const u of bad) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { email: null } });
      await tx.auditLog.create({
        data: {
          appUserId: null,
          action: "user.email_cleared",
          entity: "user",
          entityId: u.id,
          beforeJson: { email: u.email },
          afterJson: { email: null, reason: "invalid format (scan-invalid-emails)" },
        },
      });
    });
    console.log(`  cleared #${u.id} ${u.code}`);
  }
  console.log(`\nCleared ${bad.length} invalid email(s). Originals are in audit_log (action=user.email_cleared).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
