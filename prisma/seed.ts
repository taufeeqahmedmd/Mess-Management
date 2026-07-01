/**
 * Seed — mirrors the mock (plan.md §12): 1 branch, the full role/permission set,
 * portal-employee staff (mobile + password login), Super Admin "Srikanth", the
 * categories, meal types (with windows), a rate matrix, payment modes, counters +
 * operator assignment, and default settings.
 *
 * Login is by MOBILE NUMBER (plan.md §4). Idempotent via upserts. Run: npm run db:seed.
 *
 * Deferred to their phases (kept simple here): dual charge/vendor rates and
 * per-category CategorySetting (Phase 2); multi-meal recharge coupons (Phase 4).
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS } from "../lib/rbac";
import { DEFAULT_ROLE_PERMISSIONS, ROLES, type RoleName } from "../lib/access-control";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "ChangeMe123!"; // change all seeded staff passwords after first login

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

  // --- Roles + their default permission grants (editable Access Control grid) ---
  const roleId: Record<RoleName, bigint> = {} as Record<RoleName, bigint>;
  for (const name of ROLES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    roleId[name] = role.id;
    for (const code of DEFAULT_ROLE_PERMISSIONS[name]) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permId(code) },
        },
        update: {},
        create: { roleId: role.id, permissionId: permId(code) },
      });
    }
  }

  // --- Portal employees (staff). Login = mobile + password. ---
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const staff: Array<{
    name: string;
    mobile: string;
    role: RoleName;
    branchId: bigint | null;
  }> = [
    { name: "Srikanth", mobile: "9281122104", role: "Super Admin", branchId: null },
    { name: "Admin User", mobile: "9000000001", role: "Admin", branchId: branch.id },
    { name: "Mess Incharge", mobile: "9000000002", role: "Mess Incharge", branchId: branch.id },
    { name: "Accountant", mobile: "9000000003", role: "Accountant", branchId: branch.id },
    { name: "Management", mobile: "9000000004", role: "Management", branchId: branch.id },
    { name: "Vendor Portal", mobile: "9000000005", role: "Vendor", branchId: branch.id },
  ];

  const staffId: Record<string, bigint> = {};
  for (const s of staff) {
    const u = await prisma.appUser.upsert({
      where: { mobile: s.mobile },
      update: {},
      create: {
        name: s.name,
        mobile: s.mobile,
        passwordHash,
        roleId: roleId[s.role],
        branchId: s.branchId,
      },
    });
    staffId[s.mobile] = u.id;
  }
  const messInchargeId = staffId["9000000002"];

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
      where: { name: c.name },
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

  // Item-only meal types for the food-request catalog (plan.md §15). Marked
  // `active: false` so they never become an "active meal now" at a real counter
  // (the tap engine ignores them); they exist purely as a representative meal so
  // a fulfilled request's redemption rows group sensibly in reports.
  const itemMeals = [
    { code: "COF", name: "Coffee", active: false },
    { code: "TEA", name: "Tea", active: false },
    { code: "OTH", name: "Other / Custom", active: false },
  ];
  for (const m of itemMeals) {
    const meal = await prisma.mealType.upsert({
      where: { code: m.code },
      update: {},
      create: { code: m.code, name: m.name, active: m.active },
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
  // NOTE: single charge rate for now; vendor rate (dual rates) arrives in Phase 2.
  const priceMatrix: Record<string, Record<string, number>> = {
    BRK: { STU: 25, EMP: 35, CON: 35, GST: 50, VIS: 50 },
    LUN: { STU: 45, EMP: 60, CON: 60, GST: 90, VIS: 90 },
    SNK: { STU: 15, EMP: 20, CON: 20, GST: 30, VIS: 30 },
    DIN: { STU: 45, EMP: 60, CON: 60, GST: 90, VIS: 90 },
  };
  const today = new Date();
  const validFrom = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  if ((await prisma.mealRate.count()) === 0) {
    const rows: Prisma.MealRateCreateManyInput[] = [];
    for (const [mc, byCat] of Object.entries(priceMatrix)) {
      for (const [cc, price] of Object.entries(byCat)) {
        rows.push({
          mealTypeId: mealId[mc],
          categoryId: catId[cc],
          branchId: branch.id,
          rate: new Prisma.Decimal(price),
          vendorRate: new Prisma.Decimal(price).mul(0.8).toDecimalPlaces(2), // ~80% cost
          validFrom,
        });
      }
    }
    await prisma.mealRate.createMany({ data: rows });
  }

  // --- Per-category consumption settings (one active per category) ---
  // models enables WALLET, COUPON, or both (coupon-first then wallet). Student =
  // COUPON (count), 120s duplicate window, once-per-session; others = WALLET.
  const categoryModels: Record<
    string,
    { models: ("wallet" | "coupon")[]; duplicateWindow: number; restrictMealSession: boolean }
  > = {
    STU: { models: ["coupon"], duplicateWindow: 120, restrictMealSession: true },
    EMP: { models: ["wallet"], duplicateWindow: 0, restrictMealSession: false },
    CON: { models: ["wallet"], duplicateWindow: 0, restrictMealSession: false },
    GST: { models: ["wallet"], duplicateWindow: 0, restrictMealSession: false },
    VIS: { models: ["wallet"], duplicateWindow: 0, restrictMealSession: false },
  };
  for (const [cc, cfg] of Object.entries(categoryModels)) {
    if ((await prisma.categorySetting.count({ where: { categoryId: catId[cc] } })) === 0) {
      await prisma.categorySetting.create({
        data: {
          categoryId: catId[cc],
          models: cfg.models,
          duplicateWindow: cfg.duplicateWindow,
          restrictMealSession: cfg.restrictMealSession,
        },
      });
    }
  }

  // --- Counters + operator assignment (Mess Incharge operates all) ---
  // Each counter serves a subset of meals, each with its own window (one counter
  // can perform multiple meals). Windows default to the meal's window here.
  const mealWindow = Object.fromEntries(meals.map((m) => [m.code, { start: m.startTime, end: m.endTime }]));
  const counterDefs = [
    { code: "C1", name: "Counter 1 (Main)", meals: ["BRK", "LUN", "SNK", "DIN"] },
    { code: "C2", name: "Counter 2 (Annex)", meals: ["BRK", "LUN"] },
    { code: "C3", name: "Counter 3 (Block A)", meals: ["LUN", "DIN"] },
  ];
  for (const cd of counterDefs) {
    const counter = await prisma.counter.upsert({
      where: { branchId_code: { branchId: branch.id, code: cd.code } },
      update: {},
      create: { branchId: branch.id, code: cd.code, name: cd.name },
    });
    await prisma.counterOperator.upsert({
      where: {
        counterId_appUserId: { counterId: counter.id, appUserId: messInchargeId },
      },
      update: {},
      create: { counterId: counter.id, appUserId: messInchargeId },
    });
    for (const mc of cd.meals) {
      const w = mealWindow[mc];
      await prisma.counterMeal.upsert({
        where: { counterId_mealTypeId: { counterId: counter.id, mealTypeId: mealId[mc] } },
        update: {},
        create: { counterId: counter.id, mealTypeId: mealId[mc], startTime: w.start, endTime: w.end },
      });
    }
  }

  // --- Food-request virtual counter (plan.md §15). One per branch, with NO
  //     operators and NO meal windows, so it is never selectable at /counter and
  //     never resolves an "active meal". Fulfilled food requests post their
  //     redemption rows here, giving them a real branch so settlement/reports
  //     include them automatically (no changes to reporting.ts / settlement.ts). ---
  await prisma.counter.upsert({
    where: { branchId_code: { branchId: branch.id, code: "FR" } },
    update: {},
    create: { branchId: branch.id, code: "FR", name: "Food Requests" },
  });

  // --- Food-item catalog (CATALOG-ONLY pricing). All-branch (branchId null).
  //     Each item maps to a representative meal for redemption grouping. Custom
  //     Items resolve to a catalog row too (super admin adds more as needed). ---
  const foodItems = [
    { code: "FI-COFFEE", name: "Coffee", kind: "beverage" as const, meal: "COF", price: 15, vendor: 10 },
    { code: "FI-TEA", name: "Tea", kind: "beverage" as const, meal: "TEA", price: 10, vendor: 7 },
    { code: "FI-SNACK", name: "Snacks", kind: "snack" as const, meal: "SNK", price: 20, vendor: 14 },
    { code: "FI-BRK", name: "Breakfast", kind: "meal" as const, meal: "BRK", price: 35, vendor: 28 },
    { code: "FI-LUN", name: "Lunch", kind: "meal" as const, meal: "LUN", price: 60, vendor: 48 },
    { code: "FI-DIN", name: "Dinner", kind: "meal" as const, meal: "DIN", price: 60, vendor: 48 },
    { code: "FI-CUSTOM", name: "Custom Item", kind: "custom" as const, meal: "OTH", price: 50, vendor: 40 },
  ];
  for (const fi of foodItems) {
    await prisma.foodItem.upsert({
      where: { code: fi.code },
      update: {},
      create: {
        code: fi.code,
        name: fi.name,
        kind: fi.kind,
        unitPrice: new Prisma.Decimal(fi.price),
        unitVendorPrice: new Prisma.Decimal(fi.vendor),
        mealTypeId: mealId[fi.meal],
        branchId: null,
      },
    });
  }

  // --- Vendor (caterer) + its portal login (Vendor role). The food-request
  //     workflow routes requests to a vendor; the vendor signs in as this staff
  //     account and only sees its own requests. ---
  await prisma.vendor.upsert({
    where: { code: "V1" },
    update: { appUserId: staffId["9000000005"] },
    create: { code: "V1", name: "Campus Caterers", appUserId: staffId["9000000005"] },
  });

  // --- Default settings (global). Per-category consumption config (model /
  //     duplicate-window / session-restriction) becomes CategorySetting in Phase 2. ---
  const settings: Record<string, Prisma.InputJsonValue> = {
    currency: "INR",
    // Configurable single-step approval for food requests (plan.md §15). Disabled
    // by default: requests go straight to the vendor. When enabled, requests at or
    // above `autoApproveBelow` (null = always require) wait for an approver holding
    // `approverPermission` before the vendor sees them.
    food_request_approval: {
      enabled: false,
      autoApproveBelow: null,
      approverPermission: "foodRequests.approve",
    },
  };
  for (const [settingKey, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { settingKey },
      update: { value },
      create: { settingKey, value },
    });
  }

  // --- Sample cardholders (wallet + active card) for demo/testing ---
  const sampleUsers = [
    { code: "ADM2024001", fullName: "Aarav Sharma", cat: "STU", phone: "9810000001", cardUid: "1000000001", wallet: 500 },
    { code: "ADM2024002", fullName: "Diya Patel", cat: "STU", phone: "9810000002", cardUid: "1000000002", wallet: 0 },
    { code: "EMP1001", fullName: "Rahul Verma", cat: "EMP", phone: "9810000003", cardUid: "1000000003", wallet: 1200 },
  ];
  for (const u of sampleUsers) {
    if (await prisma.user.findUnique({ where: { code: u.code } })) continue;
    await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { code: u.code, fullName: u.fullName, phone: u.phone, categoryId: catId[u.cat], branchId: branch.id, status: "active" },
      });
      await tx.wallet.create({ data: { userId: created.id, balanceAmount: new Prisma.Decimal(u.wallet) } });
      const card = await tx.rfidCard.create({
        data: { cardUid: u.cardUid, userId: created.id, status: "active", issuedAt: new Date() },
      });
      await tx.cardEvent.create({ data: { cardId: card.id, userId: created.id, type: "issue", newUid: u.cardUid } });
    });
  }

  console.log("Seed complete:", {
    branch: branch.code,
    superAdmin: "Srikanth / 9281122104",
    roles: ROLES,
    staff: staff.length,
    categories: categories.length,
    meals: meals.length + itemMeals.length,
    counters: counterDefs.length + 1, // + Food Requests virtual counter
    foodItems: foodItems.length,
    vendor: "Campus Caterers (login 9000000005, role Vendor)",
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
