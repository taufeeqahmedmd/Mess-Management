-- Self-service online top-up: recharges can have no operator
ALTER TABLE "recharges" ALTER COLUMN "app_user_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" BIGSERIAL NOT NULL,
    "jodo_order_id" VARCHAR(512) NOT NULL,
    "client_uuid" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "branch_id" BIGINT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "items" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "recharge_id" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credited_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_jodo_order_id_key" ON "payment_orders"("jodo_order_id");
CREATE UNIQUE INDEX "payment_orders_client_uuid_key" ON "payment_orders"("client_uuid");
CREATE INDEX "payment_orders_user_id_idx" ON "payment_orders"("user_id");
