import type { DefaultSession } from "next-auth";
import type { Permission } from "@/lib/rbac";

/**
 * Module augmentation: the staff identity we attach to the JWT/session after a
 * successful credentials login (role, permissions, branch scope, super-admin).
 */
declare module "next-auth" {
  interface User {
    roleName: string;
    isSuperAdmin: boolean;
    branchId: string | null;
    permissions: Permission[];
  }

  interface Session {
    user: {
      id: string;
      roleName: string;
      isSuperAdmin: boolean;
      branchId: string | null;
      permissions: Permission[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    roleName: string;
    isSuperAdmin: boolean;
    branchId: string | null;
    permissions: Permission[];
  }
}
