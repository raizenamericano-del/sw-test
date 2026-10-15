import { adminContext } from "@/lib/api-utils";
import { jsonError } from "@/lib/http";
import { assertSafeStorageKey } from "@/lib/security";
import { getStorage, StorageError } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const admin = await adminContext(request);
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(id)) return jsonError("Media tidak ditemukan.", 404, "media_not_found");
  try {
    const media = await admin.db.getMedia(admin.userId, id);
    if (!media) return jsonError("Media tidak ditemukan.", 404, "media_not_found");
    const key = assertSafeStorageKey(media.storageKey);
    const bytes = await getStorage().get(key);
    if (!bytes) return jsonError("File media sudah tidak tersedia.", 404, "media_unavailable");
    const response = new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(media.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
    return response;
  } catch (error) {
    if (error instanceof StorageError && error.code === "STORAGE_NOT_CONFIGURED") return jsonError("Penyimpanan persisten belum dikonfigurasi.", 503, "storage_not_configured");
    return jsonError("File media belum dapat diakses.", 503, "media_read_failed");
  }
}
