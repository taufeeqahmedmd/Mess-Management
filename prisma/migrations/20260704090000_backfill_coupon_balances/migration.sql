-- Backfill coupon_balances: guarantee one count-0 row per (non-deleted
-- cardholder × active meal). These rows are behaviour-neutral (the tap engine
-- and reports already treat a missing row as 0, and applyRecharge upserts on
-- grant) — this only removes the "missing record" gap so every active meal is
-- represented per cardholder. Existing rows are left untouched (ON CONFLICT DO
-- NOTHING preserves their counts). Idempotent.
INSERT INTO "coupon_balances" ("user_id", "meal_type_id", "count", "version", "updated_at")
SELECT u."id", m."id", 0, 0, now()
  FROM "users" u
  CROSS JOIN "meal_types" m
 WHERE m."active" = true
   AND u."deleted_at" IS NULL
ON CONFLICT ("user_id", "meal_type_id") DO NOTHING;
