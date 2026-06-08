"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { parseCsv } from "@/lib/csv";
import { applyRecharge } from "@/services/recharge-ledger";
import { validateRechargeInput } from "@/services/recharge";

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

      const amount = at(idx.amount) || "0";
      const coupons = mealCols
        .map((mc) => ({ mealTypeId: mc.mealTypeId, count: Number.parseInt(at(mc.col) || "0", 10) || 0 }))
        .filter((c) => c.count > 0);

      const invalid = validateRechargeInput({
        amount,
        coupons: coupons.map((c) => ({ mealTypeId: c.mealTypeId.toString(), count: c.count })),
      });
      if (invalid) throw new Error(invalid);

      const pmKey = at(idx.paymentMode).toLowerCase();
      const paymentModeId = (pmKey && pmByKey.get(pmKey)) || defaultPm;
      if (!paymentModeId) throw new Error("no payment mode available");

      const validTillStr = at(idx.validTill);
      let validTill: Date | null = null;
      if (validTillStr) {
        validTill = new Date(validTillStr);
        if (Number.isNaN(validTill.getTime())) throw new Error("invalid validTill date (use YYYY-MM-DD)");
      }

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
          clientUuid: randomUUID(),
        }),
      );
      created++;
    } catch (e) {
      failures.push({ row: rowNum, message: e instanceof Error ? e.message : "error" });
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
