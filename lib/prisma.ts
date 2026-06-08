import { PrismaClient } from "@prisma/client";

/**
 * Single PrismaClient across hot-reloads in dev (avoids exhausting connections).
 * All money/balance mutations must run through `prisma.$transaction` in services/
 * — see .claude/rules/database.md.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
