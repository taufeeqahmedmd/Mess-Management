-- Phase 4 (Recharge & ledger): multi-meal coupon grants per recharge. Replace the
-- single-meal columns on recharges with a recharge_coupons child table; add
-- edited_at + remarks.

-- DropForeignKey
ALTER TABLE "recharges" DROP CONSTRAINT "recharges_meal_type_id_fkey";

-- AlterTable
ALTER TABLE "recharges" DROP COLUMN "meal_credits",
DROP COLUMN "meal_type_id",
DROP COLUMN "remaining_meal_credits",
ADD COLUMN     "edited_at" TIMESTAMPTZ(6),
ADD COLUMN     "remarks" VARCHAR(255);

-- CreateTable
CREATE TABLE "recharge_coupons" (
    "id" BIGSERIAL NOT NULL,
    "recharge_id" BIGINT NOT NULL,
    "meal_type_id" BIGINT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "remaining" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "recharge_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recharge_coupons_recharge_id_meal_type_id_key" ON "recharge_coupons"("recharge_id", "meal_type_id");

-- AddForeignKey
ALTER TABLE "recharge_coupons" ADD CONSTRAINT "recharge_coupons_recharge_id_fkey" FOREIGN KEY ("recharge_id") REFERENCES "recharges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recharge_coupons" ADD CONSTRAINT "recharge_coupons_meal_type_id_fkey" FOREIGN KEY ("meal_type_id") REFERENCES "meal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
