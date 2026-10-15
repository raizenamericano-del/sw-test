import { NextResponse } from "next/server";
import { adminContext } from "@/lib/api-utils";
import { noStore } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await adminContext(request);
  if (!context.ok) return context.response;
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") || "").slice(0, 120);
    const type = url.searchParams.get("type");
    const allItems = (await context.db.listMedia(context.userId, query)).filter((item) => !type || type === "all" || item.mediaType === type);
    const items = allItems.slice(0, 250);
    const configuredMb = Number.parseInt(process.env.MAX_UPLOAD_MB || "100", 10);
    const maxUploadMb = Number.isFinite(configuredMb) ? Math.min(Math.max(configuredMb, 1), 500) : 100;
    return noStore(NextResponse.json({ items, total: allItems.length, maxUploadMb }));
  } catch {
    return NextResponse.json({ error: { code: "library_unavailable", message: "Media Library belum dapat dimuat." } }, { status: 503 });
  }
}
