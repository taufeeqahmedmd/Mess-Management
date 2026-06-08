import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

/**
 * Edge proxy (Next 16's renamed "middleware"): gates every route via the
 * `authorized` callback in authConfig (public allowlist + "must be signed in"
 * for the rest). Edge-safe config only — no Prisma/bcrypt here.
 */
export default NextAuth(authConfig).auth;

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|assets|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)",
  ],
};
