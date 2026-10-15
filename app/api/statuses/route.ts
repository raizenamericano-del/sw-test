import { NextResponse } from "next/server";
import { adminContext } from "@/lib/api-utils";
import { noStore } from "@/lib/http";
import { getProvider } from "@/lib/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await adminContext(request);
  if (!context.ok) return context.response;
  try {
    const result = await getProvider().listStatuses(context.userId, context.db);
    return noStore(NextResponse.json({ ...result, refreshedAt: new Date().toISOString() }));
  } catch {
    return NextResponse.json({ error: { code: "statuses_unavailable", message: "Feed Status yang benar-benar diterima belum dapat dibaca." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
