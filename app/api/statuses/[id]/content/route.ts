import { adminContext } from "@/lib/api-utils";
import { jsonError } from "@/lib/http";
import { getProvider } from "@/lib/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const admin = await adminContext(request);
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  if (!/^[a-f0-9]{64}$/i.test(id)) return jsonError("Status media tidak tersedia.", 404, "status_not_available");
  try {
    const media = await getProvider().downloadStatusMedia(admin.userId, id);
    return new Response(new Uint8Array(media.bytes), {
      status: 200,
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(media.bytes.byteLength),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(media.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "STATUS_EXPIRED") return jsonError("Status sudah kedaluwarsa atau tidak lagi tersedia.", 404, "status_expired");
    if (error instanceof Error && error.message === "STATUS_MEDIA_TOO_LARGE") return jsonError("Media Status melewati batas ukuran aplikasi.", 413, "status_media_too_large");
    if (error instanceof Error && error.message === "STATUS_MEDIA_UNSUPPORTED") return jsonError("Jenis media Status tidak didukung.", 415, "status_media_unsupported");
    if (error instanceof Error && error.message === "STATUS_NOT_AVAILABLE") return jsonError("Media ini tidak lagi tersedia dari sesi WhatsApp aktif.", 404, "status_not_available");
    return jsonError("Preview Status belum dapat diambil dari sesi tertaut.", 503, "status_media_failed");
  }
}
