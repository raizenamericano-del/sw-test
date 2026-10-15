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
    const provider = getProvider();
    const session = await provider.getSession(context.userId, context.db);
    return noStore(NextResponse.json({
      session,
      capabilities: provider.capabilities,
      message: provider.status().message,
    }));
  } catch {
    return NextResponse.json({ error: { code: "session_unavailable", message: "Status sesi belum dapat dibaca." } }, { status: 503 });
  }
}
