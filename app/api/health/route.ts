import { NextResponse } from "next/server";
import { collectHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await collectHealth();
  return NextResponse.json(health, { status: health.status === "healthy" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
