-- CreateTable
CREATE TABLE "payment_config" (
    "id" BIGSERIAL NOT NULL,
    "branch_id" BIGINT NOT NULL,
    "collector_code" VARCHAR(60),
    "url" VARCHAR(255),
    "api_key" VARCHAR(190),
    "api_secret" VARCHAR(255),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_config_branch_id_key" ON "payment_config"("branch_id");

-- AddForeignKey
ALTER TABLE "payment_config" ADD CONSTRAINT "payment_config_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data migration: preserve existing per-branch collector codes in the new table
-- BEFORE dropping the column. url/api_key/api_secret are filled in later, directly
-- in the DB (there is no UI to edit credentials).
INSERT INTO "payment_config" ("branch_id", "collector_code", "updated_at")
SELECT "id", "collector_code", now()
FROM "branches"
WHERE "collector_code" IS NOT NULL;

-- DropTable: superseded by payment_config (was empty)
DROP TABLE "branch_payment_gateway";

-- AlterTable: collector_code has moved to payment_config
ALTER TABLE "branches" DROP COLUMN "collector_code";
