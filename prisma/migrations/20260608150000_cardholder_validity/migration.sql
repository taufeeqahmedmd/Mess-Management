-- Phase 3 (Cardholders & cards): user-level validity (card_expiry_date +
-- validity_expired) and the deferred "one ACTIVE card per user" partial index.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "card_expiry_date" DATE,
ADD COLUMN     "validity_expired" BOOLEAN NOT NULL DEFAULT false;

-- One ACTIVE rfid_card per user (partial unique — not expressible in the Prisma
-- schema; also enforced in the service when issuing/replacing a card).
CREATE UNIQUE INDEX "rfid_cards_one_active_per_user"
    ON "rfid_cards"("user_id") WHERE "status" = 'active';
