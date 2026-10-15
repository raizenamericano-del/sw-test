import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { adminContext } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { ipKey, jsonError, mutationError, rateLimitResponse } from "@/lib/http";
import { validateMediaBytes } from "@/lib/security";
import { createLibraryAsset } from "@/lib/services";
import { StorageError } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function maxUploadBytes(): number {
  const configured = Number.parseInt(process.env.MAX_UPLOAD_MB || "100", 10);
  const mb = Number.isFinite(configured) ? Math.min(Math.max(configured, 1), 500) : 100;
  return mb * 1024 * 1024;
}

export async function POST(request: Request) {
  const originError = mutationError(request);
  if (originError) return originError;
  const rate = checkRateLimit(`upload:${ipKey(request)}`, 30, 60 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
  const context = await adminContext(request);
  if (!context.ok) return context.response;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxUploadBytes() + 1024 * 1024) return jsonError("File melewati batas ukuran.", 413, "file_too_large");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Upload tidak dapat dibaca.", 400, "invalid_upload");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Pilih satu file media untuk diunggah.", 400, "file_required");
  if (file.size <= 0) return jsonError("File kosong tidak dapat disimpan.", 400, "empty_file");
  if (file.size > maxUploadBytes()) return jsonError(`Ukuran maksimum ${Math.round(maxUploadBytes() / 1024 / 1024)} MB.`, 413, "file_too_large");
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return jsonError("File tidak dapat dibaca.", 400, "invalid_upload");
  }
  const verified = validateMediaBytes(bytes, file.type || "application/octet-stream");
  if (!verified) return jsonError("Jenis file tidak didukung atau isi file tidak cocok dengan MIME type. Gunakan JPG, PNG, WEBP, GIF, MP4, atau WEBM.", 415, "unsupported_media");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  try {
    const existing = (await context.db.listMedia(context.userId)).find((item) => item.sha256 === checksum);
    if (existing) return jsonError("File yang sama sudah ada di Media Library.", 409, "duplicate_media");
    const media = await createLibraryAsset({
      originalName: file.name,
      mimeType: verified.mimeType,
      mediaType: verified.mediaType,
      extension: verified.extension,
      bytes,
    });
    return NextResponse.json({ media }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StorageError && error.code === "STORAGE_NOT_CONFIGURED") return jsonError("Penyimpanan persisten belum dikonfigurasi.", 503, "storage_not_configured");
    if (error instanceof StorageError) return jsonError("Penyimpanan media sedang bermasalah.", 503, "storage_failed");
    return jsonError("File tidak dapat disimpan. Coba lagi.", 500, "media_save_failed");
  }
}
