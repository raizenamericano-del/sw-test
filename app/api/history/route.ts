import { NextResponse } from "next/server";
import { adminContext } from "@/lib/api-utils";
import { noStore } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await adminContext(request);
  if (!context.ok) return context.response;
  try {
    const downloads = await context.db.listDownloads(context.userId, 200);
    return noStore(NextResponse.json({ items: downloads, total: downloads.length }));
  } catch {
    return NextResponse.json({ error: { code: "history_unavailable", message: "Riwayat unduhan belum dapat dimuat." } }, { status: 503 });
  }
}
