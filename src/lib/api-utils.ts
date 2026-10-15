import { ADMIN_USER_ID, ensureAdminDatabase } from "./db";
import { withTimeout } from "./timeout";
import { authError, jsonError } from "./http";
import type { AppDatabase } from "./types";

export type AdminContext = { ok: true; db: AppDatabase; userId: string } | { ok: false; response: ReturnType<typeof jsonError> };

export async function adminContext(request: Request): Promise<AdminContext> {
  const unauthorized = authError(request);
  if (unauthorized) return { ok: false, response: unauthorized };
  try {
    const db = await withTimeout(ensureAdminDatabase(), 8000, "Database operation timed out.");
    return { ok: true, db, userId: ADMIN_USER_ID };
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_URL_REQUIRED") {
      return { ok: false, response: jsonError("Database production belum dikonfigurasi. Tambahkan DATABASE_URL.", 503, "database_not_configured") };
    }
    return { ok: false, response: jsonError("Database belum tersedia. Coba lagi setelah layanan pulih.", 503, "database_unavailable") };
  }
}

export function safeServerError(): ReturnType<typeof jsonError> {
  return jsonError("Permintaan gagal diproses. Silakan coba lagi.", 500, "internal_error");
}

export function parsePositiveInt(raw: string | null, fallback: number, max: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, max) : fallback;
}
