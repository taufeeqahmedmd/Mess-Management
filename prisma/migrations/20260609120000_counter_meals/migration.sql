-- Per-counter meal service windows: one counter can serve several meals, each
-- with its own [start, end) window. These override the meal's default window for
-- taps at this counter (the tap engine falls back to the global meal windows when
-- a counter has no rows). See services/counter-meals.ts.

-- CreateTable
CREATE TABLE "counter_meals" (
    "id" BIGSERIAL NOT NULL,
    "counter_id" BIGINT NOT NULL,
    "meal_type_id" BIGINT NOT NULL,
    "start_time" VARCHAR(5) NOT NULL DEFAULT '00:00',
    "end_time" VARCHAR(5) NOT NULL DEFAULT '00:00',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "counter_meals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "counter_meals_meal_type_id_idx" ON "counter_meals"("meal_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "counter_meals_counter_id_meal_type_id_key" ON "counter_meals"("counter_id", "meal_type_id");

-- AddForeignKey
ALTER TABLE "counter_meals" ADD CONSTRAINT "counter_meals_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "counters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_meals" ADD CONSTRAINT "counter_meals_meal_type_id_fkey" FOREIGN KEY ("meal_type_id") REFERENCES "meal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
