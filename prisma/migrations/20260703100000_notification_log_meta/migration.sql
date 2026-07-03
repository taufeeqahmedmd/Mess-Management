-- Channel payload for deferred/re-sends (daily digest flush): email carries its
-- sending entity, whatsapp its approved template id + ordered variables.
ALTER TABLE "notification_logs" ADD COLUMN "meta" JSONB;
