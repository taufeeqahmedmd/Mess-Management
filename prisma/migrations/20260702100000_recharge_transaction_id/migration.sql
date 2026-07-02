-- Gateway transaction id for online top-ups (shown on recharge + activity views)
ALTER TABLE "recharges" ADD COLUMN "transaction_id" VARCHAR(120);
