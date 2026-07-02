-- AlterTable: expand vendor with contact, address, bank, and notes details
ALTER TABLE "vendors"
  ADD COLUMN     "phone" VARCHAR(20),
  ADD COLUMN     "email" VARCHAR(150),
  ADD COLUMN     "address" TEXT,
  ADD COLUMN     "bank_name" VARCHAR(150),
  ADD COLUMN     "bank_account_name" VARCHAR(150),
  ADD COLUMN     "bank_account_number" VARCHAR(40),
  ADD COLUMN     "bank_ifsc" VARCHAR(20),
  ADD COLUMN     "notes" TEXT;

-- AlterTable: staff (Vendor / Mess Incharge role) belong to a vendor
ALTER TABLE "app_users" ADD COLUMN     "vendor_id" BIGINT;

-- CreateIndex
CREATE INDEX "app_users_vendor_id_idx" ON "app_users"("vendor_id");

-- AddForeignKey
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
