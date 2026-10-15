import { NextResponse } from "next/server";
import { isMutationRequestAllowed, jsonError } from "@/lib/http";
import { SESSION_COOKIE } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isMutationRequestAllowed(request)) return jsonError("Permintaan ditolak karena asal request tidak valid.", 403, "csrf_check_failed");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
