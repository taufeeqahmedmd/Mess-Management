-- WhatsApp templates are synced from the Partner API (Pinbot/Smartping); the send
-- needs each template's language code alongside its name.
ALTER TABLE "notification_templates" ADD COLUMN "wa_language" VARCHAR(10);
