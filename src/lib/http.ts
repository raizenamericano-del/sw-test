import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./security";

const DEV_SECRET = "imh-local-preview-only-session-secret-2026";
const DEV_PASSWORD = "imhub-demo-2026";
const baseSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : DEV_SECRET);
const adminPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : DEV_PASSWORD);
export const sessionSecret = baseSecret && Buffer.byteLength(baseSecret) >= 32 && adminPassword
  ? createHash("sha256").update(`${baseSecret}:${adminPassword}`).digest("hex")
  : "";

export function jsonError(message: string, status: number, code = "request_failed", headers?: HeadersInit): NextResponse {
  const response = NextResponse.json({ error: { code, message } }, { status });
  if (headers) new Headers(headers).forEach((value, key) => response.headers.set(key, value));
  return response;
}

export function requestOriginMatches(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const requestUrl = new URL(request.url);
    const configuredOrigin = process.env.APP_BASE_URL?.trim();
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const expectedOrigin = configuredOrigin
      ? new URL(configuredOrigin).origin
      : forwardedHost
        ? `${forwardedProto || requestUrl.protocol.replace(":", "")}://${forwardedHost}`
        : requestUrl.origin;
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function isMutationRequestAllowed(request: Request): boolean {
  if (!requestOriginMatches(request)) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

export function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

export function authenticatedUsername(request: NextRequest | Request): string | null {
  if (!sessionSecret || sessionSecret.length < 32) return null;
  const token = readCookie(request, SESSION_COOKIE);
  return verifySessionToken(token, sessionSecret)?.sub ?? null;
}

export function authError(request: Request): NextResponse | null {
  if (!sessionSecret || sessionSecret.length < 32) return jsonError("Konfigurasi sesi belum aman. Atur SESSION_SECRET.", 503, "auth_not_configured");
  const username = authenticatedUsername(request);
  if (!username || username !== (process.env.ADMIN_USERNAME || (process.env.NODE_ENV === "production" ? "" : "admin"))) {
    return jsonError("Sesi admin tidak aktif. Silakan masuk kembali.", 401, "unauthorized");
  }
  return null;
}

export function mutationError(request: Request): NextResponse | null {
  if (!isMutationRequestAllowed(request)) return jsonError("Permintaan ditolak karena asal request tidak valid.", 403, "csrf_check_failed");
  return null;
}

export function ipKey(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return realIp || forwarded || "unknown";
}

export function rateLimitResponse(retryAfterSeconds: number): NextResponse {
  return jsonError("Terlalu banyak percobaan. Coba lagi sebentar.", 429, "rate_limited", { "Retry-After": String(retryAfterSeconds) });
}

export function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
