-- Phase 1: staff login by mobile number (plan.md §4). Replace username with a
-- display name + unique mobile login handle; make email optional.

-- DropIndex
DROP INDEX "app_users_username_key";

-- AlterTable
ALTER TABLE "app_users" DROP COLUMN "username",
ADD COLUMN     "mobile" VARCHAR(20) NOT NULL,
ADD COLUMN     "name" VARCHAR(150) NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "app_users_mobile_key" ON "app_users"("mobile");
