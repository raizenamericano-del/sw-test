import { NextResponse } from "next/server";
import { adminContext } from "@/lib/api-utils";
import { jsonError, mutationError } from "@/lib/http";
import { deleteLibraryAsset } from "@/lib/services";
import { StorageError } from "@/lib/storage";

export const runtime = "nodejs";

interface RouteContext { params: Promise<{ id: string }> }

export async function DELETE(request: Request, context: RouteContext) {
  const originError = mutationError(request);
  if (originError) return originError;
  const admin = await adminContext(request);
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(id)) return jsonError("Media tidak ditemukan.", 404, "media_not_found");
  try {
    const media = await admin.db.getMedia(admin.userId, id);
    if (!media) return jsonError("Media tidak ditemukan.", 404, "media_not_found");
    await deleteLibraryAsset(media);
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof StorageError) return jsonError("File belum dapat dihapus dari penyimpanan. Coba lagi.", 503, "storage_failed");
    if (error instanceof Error && error.message === "MEDIA_NOT_FOUND") return jsonError("Media tidak ditemukan.", 404, "media_not_found");
    return jsonError("Media belum dapat dihapus.", 503, "delete_failed");
  }
}
