-- AlterTable
ALTER TABLE "app_users" ADD COLUMN     "cardholder_user_id" BIGINT;

-- AddForeignKey
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_cardholder_user_id_fkey" FOREIGN KEY ("cardholder_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

