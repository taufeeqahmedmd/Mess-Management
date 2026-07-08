-- DropForeignKey
ALTER TABLE "recharges" DROP CONSTRAINT "recharges_app_user_id_fkey";

-- DropIndex
DROP INDEX "app_users_vendor_id_idx";

-- DropIndex
DROP INDEX "delivery_locations_branch_id_idx";

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "contact_required" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "recharges" ADD CONSTRAINT "recharges_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
