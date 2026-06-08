import { z } from "zod";

/**
 * Shared client + server validation for the public self-service handle. Kept in
 * its own Prisma-free module so the client bundle never pulls in `@prisma/client`
 * (the data-access service does). Bounded + alphanumeric-ish to blunt abuse.
 */
export const publicCodeSchema = z
  .string()
  .trim()
  .min(1, "Enter your ID.")
  .max(40, "That ID is too long.")
  .regex(/^[A-Za-z0-9/_-]+$/, "That doesn't look like a valid ID.");
