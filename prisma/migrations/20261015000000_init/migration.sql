CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'meta-cloud-api',
  "state" TEXT NOT NULL DEFAULT 'disconnected',
  "connectedAt" TIMESTAMP(3),
  "lastConnectedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "media_assets" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sha256" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual-import',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "download_history" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mediaId" TEXT,
  "fileName" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  CONSTRAINT "download_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "activity_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "retentionDays" INTEGER NOT NULL DEFAULT 30,
  "autoCleanup" BOOLEAN NOT NULL DEFAULT true,
  "libraryView" TEXT NOT NULL DEFAULT 'grid',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "whatsapp_sessions_userId_key" ON "whatsapp_sessions"("userId");
CREATE UNIQUE INDEX "media_assets_storageKey_key" ON "media_assets"("storageKey");
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");
CREATE INDEX "media_assets_userId_createdAt_idx" ON "media_assets"("userId", "createdAt");
CREATE INDEX "download_history_userId_startedAt_idx" ON "download_history"("userId", "startedAt");
CREATE INDEX "activity_logs_userId_createdAt_idx" ON "activity_logs"("userId", "createdAt");

ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "download_history" ADD CONSTRAINT "download_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "download_history" ADD CONSTRAINT "download_history_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
