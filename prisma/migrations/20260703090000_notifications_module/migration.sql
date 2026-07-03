-- Notifications module (Super Admin): per-event×channel rules, channel templates
-- (incl. WhatsApp Business template ids + variable mapping), email sending
-- entities (Pallavi / DPS) mapped per branch, web-push subscriptions for staff
-- logins, and the append-only notification outbox/log.

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('push', 'email', 'whatsapp');
CREATE TYPE "NotificationFrequency" AS ENUM ('instant', 'daily_digest');
CREATE TYPE "NotificationLogStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" BIGSERIAL NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200),
    "body" TEXT NOT NULL,
    "wa_template_id" VARCHAR(120),
    "wa_variables" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_rules" (
    "id" BIGSERIAL NOT NULL,
    "event_code" VARCHAR(60) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "recipients" JSONB NOT NULL DEFAULT '{}',
    "frequency" "NotificationFrequency" NOT NULL DEFAULT 'instant',
    "template_id" BIGINT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_entities" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "from_name" VARCHAR(120) NOT NULL,
    "from_email" VARCHAR(150) NOT NULL,
    "env_prefix" VARCHAR(40) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" BIGSERIAL NOT NULL,
    "app_user_id" BIGINT NOT NULL,
    "endpoint" VARCHAR(1024) NOT NULL,
    "p256dh" VARCHAR(255) NOT NULL,
    "auth" VARCHAR(255) NOT NULL,
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" BIGSERIAL NOT NULL,
    "event_code" VARCHAR(60) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "title" VARCHAR(200),
    "body" TEXT NOT NULL,
    "status" "NotificationLogStatus" NOT NULL DEFAULT 'pending',
    "error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- AlterTable: which email entity mails a branch's cardholders
ALTER TABLE "branches" ADD COLUMN "email_entity_id" BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "notification_rules_event_code_channel_key" ON "notification_rules"("event_code", "channel");
CREATE UNIQUE INDEX "email_entities_name_key" ON "email_entities"("name");
CREATE UNIQUE INDEX "email_entities_env_prefix_key" ON "email_entities"("env_prefix");
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_app_user_id_idx" ON "push_subscriptions"("app_user_id");
CREATE INDEX "notification_logs_event_code_channel_idx" ON "notification_logs"("event_code", "channel");
CREATE INDEX "notification_logs_created_at_idx" ON "notification_logs"("created_at");

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_email_entity_id_fkey" FOREIGN KEY ("email_entity_id") REFERENCES "email_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
