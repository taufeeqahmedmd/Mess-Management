/**
 * Global search across the app's primary entities (plan.md §9). Each group is
 * gated by the actor's permission and branch-scoped, so a result never leaks an
 * entity the actor can't otherwise see. Read-only; returns at most LIMIT rows per
 * group with a "view all" link to the full list.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { can, type Actor } from "@/lib/rbac";
import type { IconName } from "@/components/shell/icons";

type Db = PrismaClient | Prisma.TransactionClient;

export type SearchItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  code?: string; // rendered monospace when present
};

export type SearchGroup = {
  key: string;
  label: string;
  icon: IconName;
  items: SearchItem[];
  more: { href: string; label: string };
};

const LIMIT = 6;

const ci = (q: string): Prisma.StringFilter => ({ contains: q, mode: "insensitive" });

export async function searchEntities(db: Db, actor: Actor, q: string): Promise<SearchGroup[]> {
  const term = q.trim();
  if (!term) return [];

  const branchId = actor.branchId ? BigInt(actor.branchId) : null;
  const groups: SearchGroup[] = [];

  // --- Cardholders (users.view) ---
  if (can(actor, "users.view")) {
    const users = await db.user.findMany({
      where: {
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        OR: [
          { code: ci(term) },
          { fullName: ci(term) },
          { phone: { contains: term } },
          { email: ci(term) },
          { cards: { some: { cardUid: { contains: term } } } },
        ],
      },
      include: { category: true },
      orderBy: { fullName: "asc" },
      take: LIMIT,
    });
    if (users.length) {
      groups.push({
        key: "cardholders",
        label: "Cardholders",
        icon: "users",
        items: users.map((u) => ({
          id: u.id.toString(),
          title: u.fullName,
          subtitle: `${u.code} · ${u.category.name}`,
          href: `/users/${u.id}`,
          code: u.code,
        })),
        more: { href: `/users?q=${encodeURIComponent(term)}`, label: "All cardholders" },
      });
    }
  }

  // --- Staff (staff.manage) ---
  if (can(actor, "staff.manage")) {
    const staff = await db.appUser.findMany({
      where: {
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        OR: [{ name: ci(term) }, { mobile: { contains: term } }, { email: ci(term) }],
      },
      include: { role: true },
      orderBy: { name: "asc" },
      take: LIMIT,
    });
    if (staff.length) {
      groups.push({
        key: "staff",
        label: "Staff",
        icon: "user",
        items: staff.map((s) => ({
          id: s.id.toString(),
          title: s.name,
          subtitle: `${s.role.name} · ${s.mobile}`,
          href: `/settings/staff/${s.id}/edit`,
          code: s.mobile,
        })),
        more: { href: "/settings/staff", label: "All staff" },
      });
    }
  }

  // --- Counters (counters.manage) ---
  if (can(actor, "counters.manage")) {
    const counters = await db.counter.findMany({
      where: {
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        OR: [{ code: ci(term) }, { name: ci(term) }],
      },
      include: { branch: true },
      orderBy: { name: "asc" },
      take: LIMIT,
    });
    if (counters.length) {
      groups.push({
        key: "counters",
        label: "Counters",
        icon: "counter",
        items: counters.map((c) => ({
          id: c.id.toString(),
          title: c.name,
          subtitle: `${c.code} · ${c.branch.name}`,
          href: `/settings/counters/${c.id}/edit`,
          code: c.code,
        })),
        more: { href: "/settings/counters", label: "All counters" },
      });
    }
  }

  // --- Vendors (settlements.view) ---
  if (can(actor, "settlements.view")) {
    const canManage = can(actor, "settlements.manage");
    const vendors = await db.vendor.findMany({
      where: { OR: [{ code: ci(term) }, { name: ci(term) }, { gstin: ci(term) }] },
      orderBy: { name: "asc" },
      take: LIMIT,
    });
    if (vendors.length) {
      groups.push({
        key: "vendors",
        label: "Vendors",
        icon: "vendor",
        items: vendors.map((v) => ({
          id: v.id.toString(),
          title: v.name,
          subtitle: v.gstin ? `${v.code} · ${v.gstin}` : v.code,
          href: canManage ? `/settlements/vendors/${v.id}/edit` : "/settlements/vendors",
          code: v.code,
        })),
        more: { href: "/settlements/vendors", label: "All vendors" },
      });
    }
  }

  return groups;
}
