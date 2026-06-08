-- Money integrity safety net (plan.md / db-schema.md): balances and unspent
-- remainders can never go negative. The service already checks before debiting;
-- these CHECKs guarantee it at the DB level even under concurrency. (CHECK
-- constraints aren't expressible in the Prisma schema — raw SQL, like the
-- partial unique indexes.)

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_nonneg" CHECK ("balance_amount" >= 0);
ALTER TABLE "coupon_balances" ADD CONSTRAINT "coupon_balances_count_nonneg" CHECK ("count" >= 0);
ALTER TABLE "recharges" ADD CONSTRAINT "recharges_remaining_nonneg" CHECK ("remaining_amount" >= 0);
