import { NextResponse } from "next/server";
import { z } from "zod";
import { credentialsMatch, getAdminCredentials } from "@/lib/auth-config";
import { ensureAdminDatabase } from "@/lib/db";
import { SESSION_TTL_SECONDS, SESSION_COOKIE, createSessionToken } from "@/lib/security";
import { sessionSecret, isMutationRequestAllowed, jsonError, ipKey, rateLimitResponse } from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  if (!isMutationRequestAllowed(request)) return jsonError("Permintaan ditolak karena asal request tidak valid.", 403, "csrf_check_failed");
  const rate = checkRateLimit(`login:${ipKey(request)}`, 8, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 4096) return jsonError("Permintaan terlalu besar.", 413, "payload_too_large");
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("Format permintaan tidak valid.", 400, "invalid_json");
  }
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return jsonError("Masukkan username dan password yang valid.", 400, "invalid_input");
  const accountRate = checkRateLimit(`login-user:${parsed.data.username.toLocaleLowerCase()}`, 8, 15 * 60 * 1000);
  if (!accountRate.allowed) return rateLimitResponse(accountRate.retryAfterSeconds);
  const expected = getAdminCredentials();
  if (!expected) return jsonError("Login admin belum dikonfigurasi. Atur ADMIN_USERNAME dan ADMIN_PASSWORD.", 503, "auth_not_configured");
  if (!sessionSecret || sessionSecret.length < 32) return jsonError("SESSION_SECRET harus berisi sedikitnya 32 karakter.", 503, "auth_not_configured");
  if (!credentialsMatch(parsed.data.username, parsed.data.password, expected.username, expected.password)) {
    return jsonError("Username atau password tidak cocok.", 401, "invalid_credentials");
  }
  try {
    const db = await ensureAdminDatabase();
    const user = process.env.ADMIN_USERNAME || "admin";
    await db.getSession("admin");
    const token = createSessionToken(user, sessionSecret);
    const response = NextResponse.json({ ok: true, user: { username: user } });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch {
    return jsonError("Database belum tersedia. Admin belum dapat masuk.", 503, "database_unavailable");
  }
}
