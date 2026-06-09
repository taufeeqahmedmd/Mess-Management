"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { deterministicUuid } from "@/lib/idempotency";
import { writeAudit } from "@/lib/audit";
import { parseCsv } from "@/lib/csv";
import { applyRecharge } from "@/services/recharge-ledger";
import { couponValue } from "@/services/recharge";
import { defaultRatesForCategory } from "@/services/pricing";

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

export type RechargeImportReport = {
  error?: string;
  total?: number;
  created?: number;
  failures?: { row: number; message: string }[];
};

const MAX_BYTES = 2_000_000;

export async function importRechargesAction(
  _prev: RechargeImportReport,
  formData: FormData,
): Promise<RechargeImportReport> {
  const actor = await requirePermission("recharge.import");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > MAX_BYTES) return { error: "File too large (max 2 MB)." };

  const rows = parseCsv(await file.text()).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) return { error: "The file has a header but no data rows." };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {
    identifier: header.indexOf("identifier"),
    amount: header.indexOf("amount"),
    paymentMode: header.indexOf("paymentmode"),
    validTill: header.indexOf("validtill"),
    remarks: header.indexOf("remarks"),
  };
  if (idx.identifier < 0) return { error: "CSV must include an 'identifier' column." };

  const [meals, paymentModes] = await Promise.all([
    prisma.mealType.findMany({ where: { active: true } }),
    prisma.paymentMode.findMany({ where: { active: true } }),
  ]);
  // Any header column matching a meal code is treated as that meal's coupon count.
  const mealCols: { col: number; mealTypeId: bigint }[] = [];
  header.forEach((h, i) => {
    const m = meals.find((mm) => mm.code.toLowerCase() === h);
    if (m) mealCols.push({ col: i, mealTypeId: m.id });
  });
  const pmByKey = new Map<string, bigint>();
  for (const p of paymentModes) {
    pmByKey.set(p.code.toLowerCase(), p.id);
    pmByKey.set(p.name.toLowerCase(), p.id);
  }
  const defaultPm = paymentModes[0]?.id;

  const today = todayUtc();
  // Cache the branch-default rate map per (branch, category) so we price coupons
  // once per distinct category, not per row.
  const ratesCache = new Map<string, Record<string, string>>();

  const failures: { row: number; message: string }[] = [];
  let created = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const at = (c: number) => (c >= 0 && c < r.length ? r[c].trim() : "");
    const rowNum = i + 1;

    try {
      const code = at(idx.identifier);
      if (!code) throw new Error("identifier is required");

      const user = await prisma.user.findUnique({ where: { code } });
      if (!user || user.deletedAt) throw new Error(`unknown cardholder "${code}"`);
      if (actor.branchId && user.branchId.toString() !== actor.branchId) throw new Error("cardholder out of your branch");
      if (user.status !== "active") throw new Error("cardholder is not active");

      const coupons = mealCols
        .map((mc) => ({ mealTypeId: mc.mealTypeId, count: Number.parseInt(at(mc.col) || "0", 10) || 0 }))
        .filter((c) => c.count > 0);
      if (coupons.length === 0) throw new Error("at least one meal coupon count is required");

      // Price the coupons at the cardholder's category rates (branch default) —
      // same model as the recharge form. The wallet money balance is NOT credited;
      // any 'amount' column in the CSV is ignored (never trust a client amount).
      const cacheKey = `${user.branchId}:${user.categoryId}`;
      let rates = ratesCache.get(cacheKey);
      if (!rates) {
        rates = await defaultRatesForCategory(prisma, { branchId: user.branchId, categoryId: user.categoryId, today });
        ratesCache.set(cacheKey, rates);
      }
      const valued = couponValue(
        coupons.map((c) => ({ mealTypeId: c.mealTypeId.toString(), count: c.count })),
        rates,
      );
      if ("missingMeal" in valued) throw new Error("no rate set for a selected meal in this category");
      const amount = valued.value.toFixed(2);

      const pmKey = at(idx.paymentMode).toLowerCase();
      const paymentModeId = (pmKey && pmByKey.get(pmKey)) || defaultPm;
      if (!paymentModeId) throw new Error("no payment mode available");

      const validTillStr = at(idx.validTill);
      let validTill: Date | null = null;
      if (validTillStr) {
        validTill = new Date(validTillStr);
        if (Number.isNaN(validTill.getTime())) throw new Error("invalid validTill date (use YYYY-MM-DD)");
      }

      // Deterministic per-row key: re-uploading the identical file is a safe
      // no-op (UNIQUE client_uuid) rather than a double credit (database.md).
      const couponSig = coupons
        .map((c) => `${c.mealTypeId}:${c.count}`)
        .sort()
        .join("|");
      const clientUuid = deterministicUuid(
        `recharge-import:${code}:${amount}:${couponSig}:${validTillStr}:${rowNum}`,
      );

      await prisma.$transaction((tx) =>
        applyRecharge(tx, {
          userId: user.id,
          amount: new Prisma.Decimal(amount),
          coupons,
          validFrom: null,
          validTill,
          paymentModeId,
          counterId: null,
          appUserId: BigInt(actor.id),
          remarks: at(idx.remarks) || null,
          clientUuid,
          creditWallet: false,
        }),
      );
      created++;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        failures.push({ row: rowNum, message: "already imported (duplicate row)" });
      } else {
        failures.push({ row: rowNum, message: e instanceof Error ? e.message : "error" });
      }
    }
  }

  await writeAudit({
    appUserId: BigInt(actor.id),
    action: "recharge.import",
    entity: "recharge",
    after: { total: rows.length - 1, created, failed: failures.length },
  });
  revalidatePath("/recharge");

  return { total: rows.length - 1, created, failures };
}
