import { NextResponse } from "next/server";
import { adminContext } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { ipKey, jsonError, mutationError, noStore, rateLimitResponse } from "@/lib/http";
import { getProvider } from "@/lib/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = mutationError(request);
  if (originError) return originError;
  const context = await adminContext(request);
  if (!context.ok) return context.response;
  const rate = checkRateLimit(`whatsapp-connect:${context.userId}:${ipKey(request)}`, 5, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

  let input: unknown;
  try { input = await request.json(); } catch { return jsonError("Masukkan nomor WhatsApp dengan kode negara.", 400, "phone_required"); }
  const phone = typeof input === "object" && input !== null && "phone" in input && typeof input.phone === "string"
    ? input.phone.replace(/\D/g, "")
    : "";
  if (!/^\d{8,15}$/.test(phone)) return jsonError("Nomor harus berisi 8–15 digit, termasuk kode negara, tanpa tanda plus atau spasi. Contoh: 6281234567890.", 400, "invalid_phone");

  try {
    const result = await getProvider().connect(context.userId, phone, context.db);
    // The pairing code is returned only to this authenticated admin response and is never persisted or logged.
    return noStore(NextResponse.json({ session: result.session, pairingCode: result.pairingCode }));
  } catch (error) {
    if (error instanceof Error && error.name === "AuthEncryptionError") {
      return jsonError("Kunci enkripsi sesi WhatsApp belum dikonfigurasi. Atur WHATSAPP_AUTH_ENCRYPTION_KEY sebelum menghubungkan akun.", 503, "auth_encryption_not_configured");
    }
    if (error instanceof Error && error.message === "CONNECTION_ALREADY_IN_PROGRESS") return jsonError("Percobaan koneksi sedang berlangsung. Periksa status sesi sebelum mencoba lagi.", 409, "connection_in_progress");
    if (error instanceof Error && error.message === "PAIRING_TIMEOUT") return jsonError("WhatsApp tidak mengirim pairing code tepat waktu. Periksa koneksi server dan coba lagi.", 504, "pairing_timeout");
    if (error instanceof Error && error.message === "PAIRING_FAILED") return jsonError("Pairing code tidak dapat diminta saat ini. Coba lagi dari halaman koneksi.", 503, "pairing_failed");
    if (error instanceof Error && error.message === "AUTH_STORAGE_FAILED") return jsonError("Kredensial sesi gagal disimpan secara terenkripsi. Koneksi dihentikan demi keamanan.", 503, "auth_storage_failed");
    return jsonError("Koneksi WhatsApp belum dapat dimulai. Periksa konfigurasi dan coba lagi.", 503, "connection_failed");
  }
}
