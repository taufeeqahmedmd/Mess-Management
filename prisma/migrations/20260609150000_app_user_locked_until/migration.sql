-- Time-windowed login lockout (plan.md §10 threat model). Previously the 5th
-- failed attempt flipped status to 'locked' permanently, recoverable only by an
-- admin — so anyone who knows an enumerable mobile could lock out any staff
-- member (including counter operators mid-service) at will. Replace that with a
-- self-clearing lock window: locked_until holds when guessing is allowed again;
-- the account stays 'active' and unlocks automatically once the window passes.

ALTER TABLE "app_users" ADD COLUMN "locked_until" TIMESTAMPTZ(6);
