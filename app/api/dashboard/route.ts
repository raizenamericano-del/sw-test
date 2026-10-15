import { NextResponse } from "next/server";
import { adminContext, safeServerError } from "@/lib/api-utils";
import { collectHealth } from "@/lib/health";
import { noStore } from "@/lib/http";
import { getProvider } from "@/lib/provider";
import { cleanupExpiredMedia } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await adminContext(request);
  if (!context.ok) return context.response;
  try {
    await cleanupExpiredMedia().catch(() => undefined);
    const provider = getProvider();
    const [session, media, successfulDownloads, activities, health] = await Promise.all([
      provider.getSession(context.userId, context.db),
      context.db.listMedia(context.userId),
      context.db.countSuccessfulDownloads(context.userId),
      context.db.listActivities(context.userId, 8),
      collectHealth(),
    ]);
    const feed = session.state === "connected" ? await provider.listStatuses(context.userId, context.db).catch(() => null) : null;
    return noStore(NextResponse.json({
      username: process.env.ADMIN_USERNAME || "admin",
      session,
      stats: {
        accessibleStatuses: feed ? feed.items.length : null,
        libraryItems: media.length,
        successfulDownloads,
      },
      activities,
      health: {
        api: "healthy",
        database: health.database,
        storage: health.storage,
        whatsapp: provider.capabilities.statusFeedExperimental ? "experimental" : provider.capabilities.receivesStatuses ? "not-configured" : "unsupported",
      },
    }));
  } catch {
    return safeServerError();
  }
}
