-- AlterTable: optional pre-built Authorization header for the Jodo gateway.
-- When set it is sent verbatim (bare tokens get a "Basic " prefix) and takes
-- precedence over the header computed from api_key/api_secret. Managed directly
-- in the DB like the rest of payment_config.
ALTER TABLE "payment_config" ADD COLUMN "auth_header" VARCHAR(500);
