import { NextResponse } from "next/server";
import { adminContext } from "@/lib/api-utils";
import { jsonError, mutationError } from "@/lib/http";
import { cleanupExpiredMedia } from "@/lib/services";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = mutationError(request);
  if (originError) return originError;
  const context = await adminContext(request);
  if (!context.ok) return context.response;
  try {
    const result = await cleanupExpiredMedia();
    return NextResponse.json(result);
  } catch {
    return jsonError("Pembersihan retensi belum dapat dilakukan.", 503, "cleanup_failed");
  }
}
