-- Phase 5 (RFID Counter): snapshot vendor cost on each tap for Profit/Loss.

-- AlterTable
ALTER TABLE "redemptions" ADD COLUMN     "vendor_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
