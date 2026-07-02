import type { NextAuthConfig } from "next-auth";
import type { Permission } from "./rbac";

/**
 * Edge-safe Auth.js config — NO Prisma/bcrypt imports, so it can run in
 * middleware (edge runtime). The Credentials provider (which needs the DB) is
 * added in lib/auth.ts (Node). Callbacks here only move already-resolved data
 * between the JWT and the session.
 */
const PUBLIC_PREFIXES = ["/login", "/top-up", "/api/auth", "/api/public", "/api/health"];

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [], // real providers live in lib/auth.ts
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
        return true;
      }
      return !!auth?.user; // protected → require a session, else redirect to /login
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id!;
        token.roleName = user.roleName;
        token.isSuperAdmin = user.isSuperAdmin;
        token.branchId = user.branchId;
        token.permissions = user.permissions;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.roleName = token.roleName as string;
        session.user.isSuperAdmin = token.isSuperAdmin as boolean;
        session.user.branchId = (token.branchId as string | null) ?? null;
        session.user.permissions = (token.permissions as Permission[]) ?? [];
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
