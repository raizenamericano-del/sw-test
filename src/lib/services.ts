import { randomUUID, createHash } from "node:crypto";
import { ADMIN_USER_ID, ensureAdminDatabase } from "./db";
import { getStorage, type MediaStorage } from "./storage";
import type { ActivityType, MediaRecord } from "./types";
import { safeFilename } from "./security";

export async function recordActivity(type: ActivityType, message: string): Promise<void> {
  const db = await ensureAdminDatabase();
  await db.createActivity({ id: randomUUID(), userId: ADMIN_USER_ID, type, message });
}

export async function createLibraryAsset(input: {
  originalName: string;
  mimeType: string;
  mediaType: "image" | "video";
  extension: string;
  bytes: Uint8Array;
  source?: MediaRecord["source"];
}, storage: MediaStorage = getStorage()): Promise<MediaRecord> {
  const db = await ensureAdminDatabase();
  const id = randomUUID();
  const fileName = safeFilename(input.originalName, input.mimeType);
  const storageKey = `media/${ADMIN_USER_ID}/${id}${input.extension}`;
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  await storage.put(storageKey, input.bytes, input.mimeType);
  let asset: MediaRecord;
  try {
    asset = await db.createMedia({
      id,
      userId: ADMIN_USER_ID,
      fileName,
      mimeType: input.mimeType,
      mediaType: input.mediaType,
      byteSize: input.bytes.byteLength,
      storageKey,
      sha256,
      source: input.source ?? "manual-import",
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
  await db.createActivity({ id: randomUUID(), userId: ADMIN_USER_ID, type: "media_imported", message: `Media ditambahkan ke library: ${fileName}` }).catch(() => undefined);
  return asset;
}

export async function deleteLibraryAsset(media: MediaRecord, storage: MediaStorage = getStorage()): Promise<void> {
  const db = await ensureAdminDatabase();
  await storage.delete(media.storageKey);
  const deleted = await db.deleteMedia(ADMIN_USER_ID, media.id);
  if (!deleted) throw new Error("MEDIA_NOT_FOUND");
  await db.createActivity({ id: randomUUID(), userId: ADMIN_USER_ID, type: "media_deleted", message: `Media dihapus dari library: ${deleted.fileName}` });
}

export async function cleanupExpiredMedia(now = Date.now()): Promise<{ deleted: number; skipped: boolean }> {
  const db = await ensureAdminDatabase();
  const preferences = await db.getPreferences(ADMIN_USER_ID);
  if (!preferences.autoCleanup || preferences.retentionDays <= 0) return { deleted: 0, skipped: true };
  const cutoff = now - preferences.retentionDays * 24 * 60 * 60 * 1000;
  const expired = (await db.listMedia(ADMIN_USER_ID)).filter((media) => Date.parse(media.createdAt) < cutoff);
  const storage = getStorage();
  let deleted = 0;
  for (const media of expired) {
    try {
      await storage.delete(media.storageKey);
      const item = await db.deleteMedia(ADMIN_USER_ID, media.id);
      if (item) {
        deleted += 1;
        await db.createActivity({ id: randomUUID(), userId: ADMIN_USER_ID, type: "media_deleted", message: `Media lama dibersihkan otomatis: ${item.fileName}` });
      }
    } catch {
      // Keep its metadata so the admin can retry rather than hiding a storage failure.
    }
  }
  return { deleted, skipped: false };
}
