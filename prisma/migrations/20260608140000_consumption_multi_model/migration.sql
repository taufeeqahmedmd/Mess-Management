-- Consumption settings: a category can enable WALLET, COUPON, or BOTH
-- (coupon-first then wallet). Convert the single `model` enum to a `models`
-- enum array, preserving existing rows (each becomes a one-element array).

-- AlterTable (data-preserving)
ALTER TABLE "category_settings" ADD COLUMN "models" "ConsumptionModel"[];
UPDATE "category_settings" SET "models" = ARRAY["model"]::"ConsumptionModel"[];
ALTER TABLE "category_settings" DROP COLUMN "model";
