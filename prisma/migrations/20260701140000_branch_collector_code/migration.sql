-- AlterTable: per-branch Jodo payment collector code
ALTER TABLE "branches" ADD COLUMN "collector_code" VARCHAR(60);
