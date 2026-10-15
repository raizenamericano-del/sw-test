ALTER TABLE "whatsapp_sessions"
  ADD COLUMN "authStateCiphertext" TEXT;

ALTER TABLE "whatsapp_sessions"
  ALTER COLUMN "provider" SET DEFAULT 'baileys';

UPDATE "whatsapp_sessions"
  SET "provider" = 'baileys'
  WHERE "provider" = 'meta-cloud-api';
