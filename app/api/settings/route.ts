import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { adminContext } from "@/lib/api-utils";
import { jsonError, mutationError, noStore } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const preferencesSchema = z.object({
  retentionDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(180), z.literal(365)]),
  autoCleanup: z.boolean(),
  libraryView: z.enum(["grid", "list"]),
});

export async function GET(request: Request) {
  const context = await adminContext(request);
  if (!context.ok) return context.response;
  try {
    const preferences = await context.db.getPreferences(context.userId);
    return noStore(NextResponse.json({ preferences }));
  } catch {
    return jsonError("Pengaturan belum dapat dimuat.", 503, "settings_unavailable");
  }
}

export async function PUT(request: Request) {
  const originError = mutationError(request);
  if (originError) return originError;
  const context = await adminContext(request);
  if (!context.ok) return context.response;
  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonError("Format permintaan tidak valid.", 400, "invalid_json"); }
  const parsed = preferencesSchema.safeParse(raw);
  if (!parsed.success) return jsonError("Pengaturan yang dikirim tidak valid.", 400, "invalid_input");
  try {
    const preferences = await context.db.setPreferences(context.userId, parsed.data);
    await context.db.createActivity({ id: randomUUID(), userId: context.userId, type: "settings_updated", message: "Preferensi Media Library diperbarui." });
    return NextResponse.json({ preferences });
  } catch {
    return jsonError("Pengaturan belum dapat disimpan.", 503, "settings_save_failed");
  }
}
