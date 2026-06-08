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
        if (!user || user.status !== "active") return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        await prisma.appUser.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
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
