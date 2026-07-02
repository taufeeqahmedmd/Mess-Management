-- CreateEnum
CREATE TYPE "FoodRequestStatus" AS ENUM ('raised', 'pending_approval', 'approved', 'vendor_accepted', 'preparing', 'out_for_delivery', 'delivered', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "FoodItemKind" AS ENUM ('beverage', 'snack', 'meal', 'custom');

-- AlterTable
ALTER TABLE "redemptions" ADD COLUMN     "food_request_id" BIGINT;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "app_user_id" BIGINT;

-- CreateTable
CREATE TABLE "food_items" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "FoodItemKind" NOT NULL DEFAULT 'meal',
    "unit_price" DECIMAL(12,2) NOT NULL,
    "unit_vendor_price" DECIMAL(12,2) NOT NULL,
    "meal_type_id" BIGINT NOT NULL,
    "branch_id" BIGINT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "food_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_requests" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "branch_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "requested_by_app_user_id" BIGINT NOT NULL,
    "vendor_id" BIGINT,
    "delivery_location" VARCHAR(150) NOT NULL,
    "requested_for" TIMESTAMPTZ(6) NOT NULL,
    "purpose" VARCHAR(255),
    "status" "FoodRequestStatus" NOT NULL DEFAULT 'raised',
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vendor_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approval_required" BOOLEAN NOT NULL DEFAULT false,
    "approved_by_app_user_id" BIGINT,
    "approved_at" TIMESTAMPTZ(6),
    "reject_reason" VARCHAR(255),
    "fulfilled_client_uuid" UUID,
    "card_id_used" BIGINT,
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "food_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_request_items" (
    "id" BIGSERIAL NOT NULL,
    "request_id" BIGINT NOT NULL,
    "food_item_id" BIGINT NOT NULL,
    "meal_type_id" BIGINT NOT NULL,
    "description" VARCHAR(255),
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "unit_vendor_price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "food_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_request_events" (
    "id" BIGSERIAL NOT NULL,
    "request_id" BIGINT NOT NULL,
    "from_status" "FoodRequestStatus",
    "to_status" "FoodRequestStatus" NOT NULL,
    "note" VARCHAR(255),
    "app_user_id" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "food_items_code_key" ON "food_items"("code");

-- CreateIndex
CREATE INDEX "food_items_branch_id_idx" ON "food_items"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_requests_code_key" ON "food_requests"("code");

-- CreateIndex
CREATE UNIQUE INDEX "food_requests_fulfilled_client_uuid_key" ON "food_requests"("fulfilled_client_uuid");

-- CreateIndex
CREATE INDEX "food_requests_branch_id_status_idx" ON "food_requests"("branch_id", "status");

-- CreateIndex
CREATE INDEX "food_requests_user_id_idx" ON "food_requests"("user_id");

-- CreateIndex
CREATE INDEX "food_requests_vendor_id_status_idx" ON "food_requests"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "food_requests_requested_by_app_user_id_idx" ON "food_requests"("requested_by_app_user_id");

-- CreateIndex
CREATE INDEX "food_request_items_request_id_idx" ON "food_request_items"("request_id");

-- CreateIndex
CREATE INDEX "food_request_events_request_id_idx" ON "food_request_events"("request_id");

-- CreateIndex
CREATE INDEX "redemptions_food_request_id_idx" ON "redemptions"("food_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_app_user_id_key" ON "vendors"("app_user_id");

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_food_request_id_fkey" FOREIGN KEY ("food_request_id") REFERENCES "food_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_items" ADD CONSTRAINT "food_items_meal_type_id_fkey" FOREIGN KEY ("meal_type_id") REFERENCES "meal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_items" ADD CONSTRAINT "food_items_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_requests" ADD CONSTRAINT "food_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_requests" ADD CONSTRAINT "food_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_requests" ADD CONSTRAINT "food_requests_requested_by_app_user_id_fkey" FOREIGN KEY ("requested_by_app_user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_requests" ADD CONSTRAINT "food_requests_approved_by_app_user_id_fkey" FOREIGN KEY ("approved_by_app_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_requests" ADD CONSTRAINT "food_requests_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_requests" ADD CONSTRAINT "food_requests_card_id_used_fkey" FOREIGN KEY ("card_id_used") REFERENCES "rfid_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_request_items" ADD CONSTRAINT "food_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "food_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_request_items" ADD CONSTRAINT "food_request_items_food_item_id_fkey" FOREIGN KEY ("food_item_id") REFERENCES "food_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_request_items" ADD CONSTRAINT "food_request_items_meal_type_id_fkey" FOREIGN KEY ("meal_type_id") REFERENCES "meal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_request_events" ADD CONSTRAINT "food_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "food_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_request_events" ADD CONSTRAINT "food_request_events_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

