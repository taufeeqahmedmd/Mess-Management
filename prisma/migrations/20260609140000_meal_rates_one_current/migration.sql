-- One current rate per key (money integrity, database.md). The tap engine resolves
-- price with findFirst(... valid_to IS NULL ...) and assumes a single current row
-- per branch × meal × category (and per counter override). Without a DB guard, a
-- race or a bad write could leave two open-ended rows → nondeterministic pricing.
-- These partial UNIQUE indexes enforce it at the DB level (partial/expression
-- indexes aren't expressible in the Prisma schema — raw SQL, like the CHECKs).
--
-- Two indexes because counter_id is nullable and Postgres treats NULLs as
-- distinct in a plain unique index: one covers branch-wide defaults (counter_id
-- NULL), the other covers counter-specific overrides (counter_id set).

CREATE UNIQUE INDEX "meal_rates_current_default_uq"
  ON "meal_rates" ("branch_id", "meal_type_id", "category_id")
  WHERE "valid_to" IS NULL AND "counter_id" IS NULL;

CREATE UNIQUE INDEX "meal_rates_current_counter_uq"
  ON "meal_rates" ("counter_id", "meal_type_id", "category_id")
  WHERE "valid_to" IS NULL AND "counter_id" IS NOT NULL;
