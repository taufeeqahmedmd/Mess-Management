"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { parseCsv } from "@/lib/csv";

export type ImportReport = {
  error?: string;
  total?: number;
  created?: number;
  failures?: { row: number; message: string }[];
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BYTES = 2_000_000;
const STATUSES = new Set(["active", "suspended", "inactive"]);

export async function importUsersAction(
  _prev: ImportReport,
  formData: FormData,
): Promise<ImportReport> {
  const actor = await requirePermission("users.import");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > MAX_BYTES) return { error: "File too large (max 2 MB)." };

  const rows = parseCsv(await file.text()).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) return { error: "The file has a header but no data rows." };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = {
    identifier: header.indexOf("identifier"),
    fullName: header.indexOf("fullname"),
    category: header.indexOf("category"),
    phone: header.indexOf("phone"),
    email: header.indexOf("email"),
    department: header.indexOf("department"),
    status: header.indexOf("status"),
    cardExpiry: header.indexOf("cardexpiry"),
    cardUid: header.indexOf("carduid"),
  };
  if (col.fullName < 0 || col.category < 0) {
    return { error: "CSV must include at least 'fullName' and 'category' columns." };
  }

  const categories = await prisma.category.findMany();
  const catByKey = new Map<string, (typeof categories)[number]>();
  for (const c of categories) {
    catByKey.set(c.code.toLowerCase(), c);
    catByKey.set(c.name.toLowerCase(), c);
  }
  const branchId = actor.branchId
    ? BigInt(actor.branchId)
    : (await prisma.branch.findFirst({ orderBy: { id: "asc" } }))?.id ?? null;
  if (branchId === null) {
    return { error: "No branch configured yet — create one under Settings → Branches first." };
  }
  const departments = await prisma.department.findMany({ where: { branchId } });
  const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d]));

  const failures: { row: number; message: string }[] = [];
  const seenCodes = new Set<string>();
  const seenUids = new Set<string>();
  let created = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const at = (c: number) => (c >= 0 && c < r.length ? r[c].trim() : "");
    const rowNum = i + 1;

    try {
      const fullName = at(col.fullName);
      const category = catByKey.get(at(col.category).toLowerCase());
      const email = at(col.email);
      const phone = at(col.phone);
      const cardUid = at(col.cardUid);
      const statusRaw = at(col.status).toLowerCase();
      const deptName = at(col.department);
      const cardExpiry = at(col.cardExpiry);
      let code = at(col.identifier);

      if (!fullName) throw new Error("fullName is required");
      if (!category) throw new Error(`unknown category "${at(col.category)}"`);

      if (!code) {
        if (category.identifierRequired) throw new Error(`${category.identifierLabel} is required`);
        code = `${category.code}-${Date.now()}-${i}`;
      } else if (category.identifierRegex) {
        let ok = true;
        try {
          ok = new RegExp(category.identifierRegex).test(code);
        } catch {
          ok = true; // bad stored regex — don't block import
        }
        if (!ok) throw new Error(`${category.identifierLabel} does not match the required format`);
      }

      if (email && !EMAIL.test(email)) throw new Error("invalid email");
      if (seenCodes.has(code.toLowerCase())) throw new Error("duplicate identifier within the file");
      if (cardUid && seenUids.has(cardUid.toLowerCase())) throw new Error("duplicate card UID within the file");

      let expiry: Date | null = null;
      if (cardExpiry) {
        expiry = new Date(cardExpiry);
        if (Number.isNaN(expiry.getTime())) throw new Error("invalid cardExpiry date (use YYYY-MM-DD)");
      }
      const status: UserStatus = STATUSES.has(statusRaw) ? (statusRaw as UserStatus) : "active";
      const dept = deptName ? (deptByName.get(deptName.toLowerCase()) ?? null) : null;

      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            code,
            fullName,
            phone: phone || null,
            email: email || null,
            categoryId: category.id,
            departmentId: dept?.id ?? null,
            branchId,
            cardExpiryDate: expiry,
            status,
            createdBy: BigInt(actor.id),
          },
        });
        if (cardUid) {
          const card = await tx.rfidCard.create({
            data: { cardUid, userId: user.id, status: "active", issuedAt: new Date() },
          });
          await tx.cardEvent.create({
            data: { cardId: card.id, userId: user.id, type: "issue", newUid: cardUid, appUserId: BigInt(actor.id) },
          });
        }
      });

      seenCodes.add(code.toLowerCase());
      if (cardUid) seenUids.add(cardUid.toLowerCase());
      created++;
    } catch (e) {
      let message = e instanceof Error ? e.message : "error";
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        message = "identifier or card UID already exists";
      }
      failures.push({ row: rowNum, message });
    }
  }

  await writeAudit({
    appUserId: BigInt(actor.id),
    action: "user.import",
    entity: "user",
    after: { total: rows.length - 1, created, failed: failures.length },
  });
  revalidatePath("/users");

  return { total: rows.length - 1, created, failures };
}
