import { NextResponse } from "next/server";
import { authenticatedUsername, authError, noStore } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const error = authError(request);
  if (error) return error;
  const username = authenticatedUsername(request);
  return noStore(NextResponse.json({ authenticated: true, user: { username } }));
}
