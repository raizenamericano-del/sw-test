import { createHash, randomUUID } from "node:crypto";
import { adminContext } from "@/lib/api-utils";
import { acquireDownloadLock, releaseDownloadLock } from "@/lib/download-lock";
import { ipKey, jsonError, mutationError, rateLimitResponse } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { getProvider } from "@/lib/provider";
import { createLibraryAsset } from "@/lib/services";
import { StorageError } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const originError = mutationError(request);
  if (originError) return originError;
  const admin = await adminContext(request);
  if (!admin.ok) return admin.response;
  const rate = checkRateLimit(`status-download:${admin.userId}:${ipKey(request)}`, 30, 60 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
  const { id: statusId } = await context.params;
  if (!/^[a-f0-9]{64}$/i.test(statusId)) return jsonError("Status media tidak tersedia.", 404, "status_not_available");
  const lockKey = `${admin.userId}:status:${statusId}`;
  if (!acquireDownloadLock(lockKey)) return jsonError("Download status ini sedang diproses.", 409, "download_in_progress");
  let downloadId: string | null = null;
  try {
    const provider = getProvider();
    const feed = await provider.listStatuses(admin.userId, admin.db);
    const item = feed.items.find((candidate) => candidate.id === statusId && candidate.available);
    if (!item) return jsonError("Status tidak lagi tersedia pada feed yang diterima sesi ini.", 404, "status_not_available");
    const initialName = `status-${statusId.slice(0, 10)}.${item.mediaType === "video" ? "mp4" : "jpg"}`;
    const entry = await admin.db.createDownload({ id: randomUUID(), userId: admin.userId, mediaId: null, fileName: initialName, status: "waiting" });
    downloadId = entry.id;
    await admin.db.updateDownload(admin.userId, entry.id, "processing");

    const media = await provider.downloadStatusMedia(admin.userId, statusId);
    const sha256 = createHash("sha256").update(media.bytes).digest("hex");
    let asset = (await admin.db.listMedia(admin.userId)).find((candidate) => candidate.sha256 === sha256) ?? null;
    if (!asset) {
      asset = await createLibraryAsset({
        originalName: media.fileName,
        mimeType: media.mimeType,
        mediaType: media.mediaType,
        extension: media.extension,
        bytes: media.bytes,
        source: "provider",
      });
    }

    await admin.db.updateDownload(admin.userId, entry.id, "completed", null, asset.id, asset.fileName);
    await admin.db.createActivity({ id: randomUUID(), userId: admin.userId, type: "download_completed", message: `Status WhatsApp disimpan ke Media Library: ${asset.fileName}` });
    return new Response(new Uint8Array(media.bytes), {
      status: 200,
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(media.bytes.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (downloadId) {
      const message = error instanceof Error ? error.message : "";
      const allowedCodes = new Set(["STATUS_EXPIRED", "STATUS_NOT_AVAILABLE", "STATUS_MEDIA_TOO_LARGE", "STATUS_MEDIA_UNSUPPORTED"]);
      const code = error instanceof StorageError ? error.code : allowedCodes.has(message) ? message : "STATUS_DOWNLOAD_FAILED";
      await admin.db.updateDownload(admin.userId, downloadId, "failed", code).catch(() => undefined);
      await admin.db.createActivity({ id: randomUUID(), userId: admin.userId, type: "download_failed", message: "Download Status gagal; periksa sesi WhatsApp dan ketersediaan media." }).catch(() => undefined);
    }
    if (error instanceof Error && error.message === "STATUS_EXPIRED") return jsonError("Status sudah kedaluwarsa atau tidak lagi tersedia.", 404, "status_expired");
    if (error instanceof Error && error.message === "STATUS_NOT_AVAILABLE") return jsonError("Media ini tidak lagi tersedia dari sesi WhatsApp aktif.", 404, "status_not_available");
    if (error instanceof Error && error.message === "STATUS_MEDIA_TOO_LARGE") return jsonError("Media Status melewati batas ukuran aplikasi.", 413, "status_media_too_large");
    if (error instanceof Error && error.message === "STATUS_MEDIA_UNSUPPORTED") return jsonError("Jenis media Status tidak didukung.", 415, "status_media_unsupported");
    if (error instanceof StorageError && error.code === "STORAGE_NOT_CONFIGURED") return jsonError("Penyimpanan persisten belum dikonfigurasi.", 503, "storage_not_configured");
    if (error instanceof StorageError) return jsonError("Penyimpanan Media Library sedang bermasalah.", 503, "storage_failed");
    return jsonError("Download Status belum dapat diselesaikan. Media mungkin telah kedaluwarsa.", 503, "status_download_failed");
  } finally {
    releaseDownloadLock(lockKey);
  }
}
