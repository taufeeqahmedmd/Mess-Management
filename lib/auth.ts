import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma";
import { authConfig } from "./auth.config";
import type { Permission } from "./rbac";

/**
 * Auth.js (NextAuth v5) — staff login by **mobile number + password**
 * (plan.md §4). JWT sessions. The authorize step (Node-only: Prisma + bcrypt)
 * verifies the credential, then loads the staff member's role, permissions, and
 * branch scope so they ride on the session token. Route gating + token/session
 * mapping live in the edge-safe authConfig.
 */
export const credentialsSchema = z.object({
  mobile: z.string().trim().min(4),
  password: z.string().min(1),
});

/** Throttle online password guessing after this many consecutive failures by
 *  starting a time-windowed lockout (plan.md §10 threat model). The lock is
 *  self-clearing — see LOCK_WINDOW_MS — so an attacker can't permanently lock a
 *  staff member out via an enumerable mobile. NOTE: this is per-account; per-IP
 *  rate limiting at the edge is the complementary mitigation (still open). */
const MAX_FAILED_LOGINS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        mobile: { label: "Mobile", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { mobile, password } = parsed.data;

        const user = await prisma.appUser.findUnique({
          where: { mobile },
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        });
        // Deny disabled accounts without revealing which (no enumeration).
        if (!user || user.status !== "active") return null;
        // Within an active lockout window → reject without checking the password,
        // so repeated guesses can't reset/extend the window.
        const now = new Date();
        if (user.lockedUntil && user.lockedUntil > now) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          // Count the failure; once it crosses the threshold start a self-clearing
          // lockout window (and reset the counter so a fresh window starts cleanly
          // after it elapses) rather than permanently locking the account.
          const failed = user.failedLogins + 1;
          const locking = failed >= MAX_FAILED_LOGINS;
          await prisma.appUser.update({
            where: { id: user.id },
            data: locking
              ? { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_WINDOW_MS) }
              : { failedLogins: failed },
          });
          return null;
        }

        // Success — clear the failure counter, drop any lock, stamp the login.
        await prisma.appUser.update({
          where: { id: user.id },
          data: { lastLoginAt: now, failedLogins: 0, lockedUntil: null },
        });

        return {
          id: user.id.toString(),
          name: user.name,
          email: user.email ?? undefined,
          roleName: user.role.name,
          isSuperAdmin: user.role.name === "Super Admin",
          branchId: user.branchId ? user.branchId.toString() : null,
          permissions: user.role.permissions.map(
            (rp) => rp.permission.code as Permission,
          ),
        };
      },
    }),
  ],
});
