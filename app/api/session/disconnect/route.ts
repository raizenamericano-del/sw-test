import { NextResponse } from "next/server";
import { adminContext } from "@/lib/api-utils";
import { jsonError, mutationError } from "@/lib/http";
import { getProvider } from "@/lib/provider";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = mutationError(request);
  if (originError) return originError;
  const context = await adminContext(request);
  if (!context.ok) return context.response;
  try {
    const session = await getProvider().disconnect(context.userId, context.db);
    return NextResponse.json({ session });
  } catch {
    return jsonError("Sesi tidak dapat diperbarui atau kredensial terenkripsi belum dapat dihapus.", 503, "session_update_failed");
  }
}
