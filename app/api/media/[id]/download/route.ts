import { randomUUID } from "node:crypto";
import { adminContext } from "@/lib/api-utils";
import { jsonError } from "@/lib/http";
import { acquireDownloadLock, releaseDownloadLock } from "@/lib/download-lock";
import { mutationError } from "@/lib/http";
import { assertSafeStorageKey } from "@/lib/security";
import { getStorage, StorageError } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const originError = mutationError(request);
  if (originError) return originError;
  const admin = await adminContext(request);
  if (!admin.ok) return admin.response;
  const { id: mediaId } = await context.params;
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(mediaId)) return jsonError("Media tidak ditemukan.", 404, "media_not_found");
  const lockKey = `${admin.userId}:${mediaId}`;
  if (!acquireDownloadLock(lockKey)) return jsonError("Download file ini sedang diproses.", 409, "download_in_progress");
  let downloadId: string | null = null;
  try {
    const media = await admin.db.getMedia(admin.userId, mediaId);
    if (!media) return jsonError("Media tidak ditemukan.", 404, "media_not_found");
    const previous = await admin.db.listDownloads(admin.userId, 100);
    const activeDuplicate = previous.find((item) => item.mediaId === mediaId && (item.status === "waiting" || item.status === "processing") && Date.now() - Date.parse(item.startedAt) < 5 * 60 * 1000);
    if (activeDuplicate) return jsonError("Download file ini sedang diproses.", 409, "download_in_progress");
    const download = await admin.db.createDownload({ id: randomUUID(), userId: admin.userId, mediaId, fileName: media.fileName, status: "waiting" });
    downloadId = download.id;
    await admin.db.updateDownload(admin.userId, download.id, "processing");
    const bytes = await getStorage().get(assertSafeStorageKey(media.storageKey));
    if (!bytes) {
      await admin.db.updateDownload(admin.userId, download.id, "failed", "MEDIA_UNAVAILABLE");
      await admin.db.createActivity({ id: randomUUID(), userId: admin.userId, type: "download_failed", message: `Download gagal — file tidak tersedia: ${media.fileName}` });
      return jsonError("File media sudah tidak tersedia. Hapus item lalu unggah ulang file yang Anda miliki.", 404, "media_unavailable");
    }
    await admin.db.updateDownload(admin.userId, download.id, "completed");
    await admin.db.createActivity({ id: randomUUID(), userId: admin.userId, type: "download_completed", message: `Download selesai: ${media.fileName}` });
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(media.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (downloadId) {
      await admin.db.updateDownload(admin.userId, downloadId, "failed", error instanceof StorageError ? error.code : "DOWNLOAD_FAILED").catch(() => undefined);
      await admin.db.createActivity({ id: randomUUID(), userId: admin.userId, type: "download_failed", message: "Download gagal karena penyimpanan atau database tidak tersedia." }).catch(() => undefined);
    }
    if (error instanceof StorageError && error.code === "STORAGE_NOT_CONFIGURED") return jsonError("Penyimpanan persisten belum dikonfigurasi.", 503, "storage_not_configured");
    if (error instanceof StorageError) return jsonError("File belum dapat diunduh. Coba lagi.", 503, "download_failed");
    return jsonError("Download gagal. Coba lagi sebentar.", 503, "download_failed");
  } finally {
    releaseDownloadLock(lockKey);
  }
}
