-- Phase 2 (Master data): dual rates (charge + vendor) and per-category
-- consumption settings (WALLET/COUPON, duplicate window, session restriction).

-- CreateEnum
CREATE TYPE "ConsumptionModel" AS ENUM ('wallet', 'coupon');

-- AlterTable
ALTER TABLE "meal_rates" ADD COLUMN     "vendor_rate" DECIMAL(12,2) NOT NULL;

-- CreateTable
CREATE TABLE "category_settings" (
    "id" BIGSERIAL NOT NULL,
    "category_id" BIGINT NOT NULL,
    "model" "ConsumptionModel" NOT NULL DEFAULT 'wallet',
    "duplicate_window" INTEGER NOT NULL DEFAULT 0,
    "restrict_meal_session" BOOLEAN NOT NULL DEFAULT false,
    "status" "CategoryStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "category_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_settings_category_id_idx" ON "category_settings"("category_id");

-- One ACTIVE consumption setting per category (partial unique — not expressible
-- in the Prisma schema; enforced here + in the service when activating a row).
CREATE UNIQUE INDEX "category_settings_one_active_per_category"
    ON "category_settings"("category_id") WHERE "status" = 'active';

-- AddForeignKey
ALTER TABLE "category_settings" ADD CONSTRAINT "category_settings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
