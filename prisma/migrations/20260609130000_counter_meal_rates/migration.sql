-- Per-counter meal rates: a rate can be specific to a counter (counter_id set)
-- or a branch-wide default (counter_id NULL). At tap time the engine resolves the
-- counter-specific rate first, then falls back to the branch default. Existing
-- rows have counter_id NULL → branch defaults (no behaviour change). See
-- services/pricing.ts.

-- AlterTable
ALTER TABLE "meal_rates" ADD COLUMN "counter_id" BIGINT;

-- CreateIndex
CREATE INDEX "meal_rates_counter_id_meal_type_id_category_id_valid_from_idx" ON "meal_rates"("counter_id", "meal_type_id", "category_id", "valid_from");

-- AddForeignKey
ALTER TABLE "meal_rates" ADD CONSTRAINT "meal_rates_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "counters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
