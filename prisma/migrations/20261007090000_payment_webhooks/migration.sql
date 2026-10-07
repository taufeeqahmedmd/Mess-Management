-- Online top-ups move from polling Jodo's get-order to Jodo's signed webhooks
-- (order.payment.debited / order.payment.settled). Polling becomes a per-order,
-- exponentially backed-off safety net.

-- payment_config: per-branch webhook secret (signs X-Jodo-Signature) + the
-- subscription ids Jodo returned, written by prisma/register-jodo-webhook.ts.
ALTER TABLE "payment_config" ADD COLUMN "webhook_secret" VARCHAR(255);
ALTER TABLE "payment_config" ADD COLUMN "webhook_ids" JSONB;

-- payment_orders: gateway timestamps, settlement UTR, and the polling schedule.
ALTER TABLE "payment_orders" ADD COLUMN "paid_at" TIMESTAMPTZ(6);
ALTER TABLE "payment_orders" ADD COLUMN "settlement_utr" VARCHAR(120);
ALTER TABLE "payment_orders" ADD COLUMN "next_check_at" TIMESTAMPTZ(6);
ALTER TABLE "payment_orders" ADD COLUMN "check_count" INTEGER NOT NULL DEFAULT 0;

-- One credited recharge per order, and a real FK so "recharge has a payment
-- order" is the authoritative online-top-up marker (replaces transaction_id != NULL).
CREATE UNIQUE INDEX "payment_orders_recharge_id_key" ON "payment_orders"("recharge_id");
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_recharge_id_fkey"
  FOREIGN KEY ("recharge_id") REFERENCES "recharges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "payment_orders_status_next_check_at_idx" ON "payment_orders"("status", "next_check_at");

-- Existing pending orders: due for their first safety-net check now (NULL would
-- also mean "due"; set explicitly so the backlog drains in created order).
UPDATE "payment_orders" SET "next_check_at" = NOW() WHERE "status" = 'pending' AND "next_check_at" IS NULL;

-- Accepted (signature-verified) webhook deliveries — audit + replay trail.
CREATE TABLE "payment_webhook_events" (
  "id" BIGSERIAL NOT NULL,
  "event_id" VARCHAR(64) NOT NULL,
  "event_code" VARCHAR(60) NOT NULL,
  "jodo_order_id" VARCHAR(512) NOT NULL,
  "payment_order_id" BIGINT,
  "payload" JSONB NOT NULL,
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(6),
  "outcome" VARCHAR(30),
  "error" VARCHAR(500),
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_webhook_events_event_id_key" ON "payment_webhook_events"("event_id");
CREATE INDEX "payment_webhook_events_jodo_order_id_idx" ON "payment_webhook_events"("jodo_order_id");
CREATE INDEX "payment_webhook_events_received_at_idx" ON "payment_webhook_events"("received_at");
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_order_id_fkey"
  FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
