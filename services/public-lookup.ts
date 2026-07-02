/**
 * Public self-service lookup (plan.md §7 #12). Unauthenticated, so every return
 * value is the MINIMUM a cardholder needs to see their own balance/history —
 * never phone, email, department, branch, card UID, or internal ids. Lookup is
 * by `code` (the globally-unique public handle); callers must rate-limit.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { formatDateTimeInZone, localDateValue } from "@/lib/time";
import { defaultRatesForCategory } from "@/services/pricing";
import { normalizePhone, normalizeEmail } from "@/lib/contact";

type Db = PrismaClient | Prisma.TransactionClient;

export type PublicBalance = {
  code: string;
  name: string;
  category: string;
  status: string; // active | suspended | inactive
  phone: string | null;
  email: string | null;
  validity: { expiresOn: string | null; expired: boolean };
  wallet: string; // "0.00"
  coupons: Array<{ meal: string; count: number }>;
};

export type PublicHistoryRow = { date: string; meal: string; paidBy: string; amount: string };

export type PublicRechargeOptions = {
  code: string;
  name: string;
  // Whether a usable phone / email is already on file. The values themselves are
  // NOT exposed (public endpoint); the server reuses them at pay time.
  hasPhone: boolean;
  hasEmail: boolean;
  meals: Array<{ id: string; name: string; price: string }>; // per-coupon charge for this cardholder's category/branch
};

function userWhere(code: string): Prisma.UserWhereInput {
  return { code: { equals: code, mode: "insensitive" }, deletedAt: null };
}

export async function getPublicBalance(db: Db, code: string): Promise<PublicBalance | null> {
  const user = await db.user.findFirst({
    where: userWhere(code),
    include: { category: true, wallet: true, couponBalances: { include: { mealType: true } } },
  });
  if (!user) return null;

  return {
    code: user.code,
    name: user.fullName,
    category: user.category.name,
    status: user.status,
    phone: user.phone ?? null,
    email: user.email ?? null,
    validity: {
      expiresOn: user.cardExpiryDate ? user.cardExpiryDate.toISOString().slice(0, 10) : null,
      expired: user.validityExpired,
    },
    wallet: (user.wallet?.balanceAmount ?? new Prisma.Decimal(0)).toFixed(2),
    coupons: user.couponBalances
      .filter((c) => c.count > 0)
      .map((c) => ({ meal: c.mealType.name, count: c.count }))
      .sort((a, b) => a.meal.localeCompare(b.meal)),
  };
}

/**
 * Meals a cardholder can buy coupons for, with the per-coupon price for their
 * category + branch (self-service recharge on /top-up). Only meals that have a
 * current rate are returned. Minimal fields; NULL when the code isn't found.
 */
export async function getPublicRechargeOptions(db: Db, code: string): Promise<PublicRechargeOptions | null> {
  const user = await db.user.findFirst({
    where: userWhere(code),
    select: { code: true, fullName: true, categoryId: true, branchId: true, phone: true, email: true },
  });
  if (!user) return null;

  const today = localDateValue(new Date());
  const rates = await defaultRatesForCategory(db, { branchId: user.branchId, categoryId: user.categoryId, today });
  const meals = await db.mealType.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });

  return {
    code: user.code,
    name: user.fullName,
    hasPhone: normalizePhone(user.phone) !== null,
    hasEmail: normalizeEmail(user.email) !== null,
    meals: meals
      .filter((m) => rates[m.id.toString()] != null)
      .map((m) => ({ id: m.id.toString(), name: m.name, price: rates[m.id.toString()] })),
  };
}

export async function getPublicHistory(
  db: Db,
  code: string,
  from: Date,
  toExclusive: Date,
): Promise<{ name: string; rows: PublicHistoryRow[] } | null> {
  const user = await db.user.findFirst({ where: userWhere(code), select: { id: true, fullName: true } });
  if (!user) return null;

  const reds = await db.redemption.findMany({
    where: { userId: user.id, status: "posted", redeemedAt: { gte: from, lt: toExclusive } },
    include: { mealType: true },
    orderBy: { redeemedAt: "desc" },
    take: 1000,
  });

  return {
    name: user.fullName,
    rows: reds.map((r) => ({
      date: formatDateTimeInZone(r.redeemedAt),
      meal: r.mealType.name,
      paidBy: r.paidBy ?? "",
      amount: r.amount.toFixed(2),
    })),
  };
}
