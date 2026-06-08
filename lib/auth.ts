import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

/**
 * Auth.js (NextAuth v5) — staff Credentials auth. JWT session strategy (so no
 * `sessions` table is needed; see db-schema.md §13 deferred decision).
 *
 * Phase 0: config + provider shape only. `authorize` is a STUB that always
 * denies — the real flow (look up app_users, verify bcrypt hash, attach role +
 * permissions + branch scope to the token) is implemented in Phase 1.
 */

export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        // TODO(Phase 1): look up app_users by email, verify bcrypt password,
        // ensure status === 'active', then return the staff identity. Roles,
        // permissions, and branch scope get attached via jwt/session callbacks.
        return null;
      },
    }),
  ],
});
