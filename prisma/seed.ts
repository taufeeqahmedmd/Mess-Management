/**
 * Seed — mirrors the mock (db-schema.md §12): 1 branch, full role/permission set,
 * a Super Admin staff account, categories, meal types (with windows), a rate
 * matrix, payment modes, counters + operator assignment, and default settings.
 *
 * Idempotent where unique keys allow (upserts); guarded by existence checks where
 * there is no natural key. Run with: npm run db:seed.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS } from "../lib/rbac";

const prisma = new PrismaClient();

async function main() {
  // --- Branch ---
  const branch = await prisma.branch.upsert({
    where: { code: "MAIN" },
    update: {},
    create: { code: "MAIN", name: "Main Campus", address: "HQ" },
  });

  // --- Permissions (module.action) ---
  await Promise.all(
    PERMISSIONS.map((code) =>
      prisma.permission.upsert({
        where: { code },
        update: {},
        create: { code, module: code.split(".")[0] },
      }),
    ),
  );
  const allPerms = await prisma.permission.findMany();
  const permId = (code: string) => allPerms.find((p) => p.code === code)!.id;

  // --- Roles + their permission grants ---
  const roleGrants: Record<string, readonly string[]> = {
    "Super Admin": PERMISSIONS, // bypasses checks anyway; granted for completeness
    Admin: [
      "users.view", "users.create", "users.edit", "users.import",
      "cards.view", "cards.replace", "cards.activate", "cards.deactivate",
      "recharge.view", "recharge.create",
      "categories.manage", "meals.manage", "rates.manage", "counters.manage",
      "reports.view", "dashboard.view",
    ],
    Accounts: [
      "users.view",
      "cards.view", "cards.activate", "cards.deactivate", "cards.replace",
      "recharge.view", "recharge.create", "recharge.edit",
      "reports.view", "dashboard.view",
    ],
    Operator: ["counter.operate"],
  };

  const roles: Record<string, bigint> = {};
  for (const [name, perms] of Object.entries(roleGrants)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    roles[name] = role.id;
    for (const code of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permId(code) } },
        update: {},
        create: { roleId: role.id, permissionId: permId(code) },
      });
    }
  }

  // --- Super Admin staff account ---
  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
  const admin = await prisma.appUser.upsert({
    where: { email: "admin@mess.local" },
    update: {},
    create: {
      username: "admin",
      email: "admin@mess.local",
      passwordHash,
      roleId: roles["Super Admin"],
      branchId: null, // all-branch
    },
  });

  // --- Categories (+ identifier config) ---
  const categories = [
    { code: "STU", name: "Student", identifierLabel: "Admission No." },
    { code: "EMP", name: "Employee", identifierLabel: "Employee ID" },
    { code: "CON", name: "Contractor", identifierLabel: "Contractor ID" },
    { code: "GST", name: "Guest", identifierLabel: "Guest ID", identifierRequired: false },
    { code: "VIS", name: "Visitor", identifierLabel: "Visitor ID", identifierRequired: false },
  ];
  const catId: Record<string, bigint> = {};
  for (const c of categories) {
    const cat = await prisma.category.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        name: c.name,
        identifierLabel: c.identifierLabel,
        identifierRequired: c.identifierRequired ?? true,
      },
    });
    catId[c.code] = cat.id;
  }

  // --- Meal types (with active windows) ---
  const meals = [
    { code: "BRK", name: "Breakfast", startTime: "07:00", endTime: "11:00" },
    { code: "LUN", name: "Lunch", startTime: "11:30", endTime: "15:00" },
    { code: "SNK", name: "Snacks", startTime: "16:00", endTime: "18:00" },
    { code: "DIN", name: "Dinner", startTime: "19:00", endTime: "22:00" },
  ];
  const mealId: Record<string, bigint> = {};
  for (const m of meals) {
    const meal = await prisma.mealType.upsert({
      where: { code: m.code },
      update: {},
      create: m,
    });
    mealId[m.code] = meal.id;
  }

  // --- Payment modes ---
  for (const pm of [
    { code: "CASH", name: "Cash" },
    { code: "CARD", name: "Card" },
    { code: "UPI", name: "UPI" },
    { code: "OTHER", name: "Other" },
  ]) {
    await prisma.paymentMode.upsert({
      where: { code: pm.code },
      update: {},
      create: pm,
    });
  }

  // --- Rate matrix (meal × category × branch), current (valid_from today) ---
  // Sample prices; tune in the Master Data module (Phase 2).
  const priceMatrix: Record<string, Record<string, number>> = {
    BRK: { STU: 25, EMP: 35, CON: 35, GST: 50, VIS: 50 },
    LUN: { STU: 45, EMP: 60, CON: 60, GST: 90, VIS: 90 },
    SNK: { STU: 15, EMP: 20, CON: 20, GST: 30, VIS: 30 },
    DIN: { STU: 45, EMP: 60, CON: 60, GST: 90, VIS: 90 },
  };
  const today = new Date();
  const validFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if ((await prisma.mealRate.count()) === 0) {
    const rows: Prisma.MealRateCreateManyInput[] = [];
    for (const [mc, byCat] of Object.entries(priceMatrix)) {
      for (const [cc, price] of Object.entries(byCat)) {
        rows.push({
          mealTypeId: mealId[mc],
          categoryId: catId[cc],
          branchId: branch.id,
          rate: new Prisma.Decimal(price),
          validFrom,
        });
      }
    }
    await prisma.mealRate.createMany({ data: rows });
  }

  // --- Counters + operator assignment ---
  const counterDefs = [
    { code: "C1", name: "Counter 1 (Main)" },
    { code: "C2", name: "Counter 2 (Annex)" },
  ];
  for (const cd of counterDefs) {
    const counter = await prisma.counter.upsert({
      where: { branchId_code: { branchId: branch.id, code: cd.code } },
      update: {},
      create: { branchId: branch.id, code: cd.code, name: cd.name },
    });
    await prisma.counterOperator.upsert({
      where: { counterId_appUserId: { counterId: counter.id, appUserId: admin.id } },
      update: {},
      create: { counterId: counter.id, appUserId: admin.id },
    });
  }

  // --- Default settings (global) ---
  const settings: Record<string, Prisma.InputJsonValue> = {
    duplicate_window_seconds: 120,
    prevent_per_meal_session: true,
    resolution_strategy: "coupon_first",
    currency: "INR",
  };
  for (const [settingKey, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { settingKey },
      update: { value },
      create: { settingKey, value },
    });
  }

  console.log("Seed complete:", {
    branch: branch.code,
    admin: admin.email,
    roles: Object.keys(roles),
    categories: categories.length,
    meals: meals.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
