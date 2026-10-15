import { PrismaClient } from "@prisma/client";
import type {
  ActivityRecord,
  AppDatabase,
  CreateActivityInput,
  CreateDownloadInput,
  CreateMediaInput,
  DownloadRecord,
  DownloadState,
  MediaRecord,
  PreferencesRecord,
  SessionRecord,
} from "../types";

const globalForPrisma = globalThis as unknown as { imhPrisma?: PrismaClient };
const prisma = globalForPrisma.imhPrisma ?? new PrismaClient({ log: [] });
if (process.env.NODE_ENV !== "production") globalForPrisma.imhPrisma = prisma;

const adminSession = (): SessionRecord => ({
  state: "disconnected",
  provider: "baileys",
  connectedAt: null,
  lastConnectedAt: null,
  lastErrorCode: null,
  updatedAt: new Date().toISOString(),
});

const defaultPreferences = (): PreferencesRecord => ({ retentionDays: 30, autoCleanup: true, libraryView: "grid", updatedAt: new Date().toISOString() });

function mapSession(record: { state: string; provider: string; connectedAt: Date | null; lastConnectedAt: Date | null; lastErrorCode: string | null; updatedAt: Date }): SessionRecord {
  return {
    state: record.state === "connected" || record.state === "connecting" ? record.state : "disconnected",
    provider: "baileys",
    connectedAt: record.connectedAt?.toISOString() ?? null,
    lastConnectedAt: record.lastConnectedAt?.toISOString() ?? null,
    lastErrorCode: record.lastErrorCode,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapMedia(record: { id: string; userId: string; fileName: string; mimeType: string; mediaType: string; byteSize: number; storageKey: string; sha256: string | null; source: string; createdAt: Date }): MediaRecord {
  return {
    id: record.id,
    userId: record.userId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    mediaType: record.mediaType === "video" ? "video" : "image",
    byteSize: record.byteSize,
    storageKey: record.storageKey,
    sha256: record.sha256,
    source: record.source === "provider" ? "provider" : "manual-import",
    createdAt: record.createdAt.toISOString(),
  };
}

function mapDownload(record: { id: string; userId: string; mediaId: string | null; fileName: string; status: string; startedAt: Date; finishedAt: Date | null; errorCode: string | null }): DownloadRecord {
  const statuses: DownloadState[] = ["waiting", "processing", "completed", "failed"];
  return {
    id: record.id,
    userId: record.userId,
    mediaId: record.mediaId,
    fileName: record.fileName,
    status: statuses.includes(record.status as DownloadState) ? record.status as DownloadState : "failed",
    startedAt: record.startedAt.toISOString(),
    finishedAt: record.finishedAt?.toISOString() ?? null,
    errorCode: record.errorCode,
  };
}

function mapActivity(record: { id: string; userId: string; type: string; message: string; createdAt: Date }): ActivityRecord {
  const allowed: ActivityRecord["type"][] = ["session_connected", "session_disconnected", "status_available", "download_completed", "download_failed", "media_imported", "media_deleted", "settings_updated"];
  return {
    id: record.id,
    userId: record.userId,
    type: allowed.includes(record.type as ActivityRecord["type"]) ? record.type as ActivityRecord["type"] : "settings_updated",
    message: record.message,
    createdAt: record.createdAt.toISOString(),
  };
}

function mapPreferences(record: { retentionDays: number; autoCleanup: boolean; libraryView: string; updatedAt: Date }): PreferencesRecord {
  return {
    retentionDays: record.retentionDays,
    autoCleanup: record.autoCleanup,
    libraryView: record.libraryView === "list" ? "list" : "grid",
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class PrismaDatabase implements AppDatabase {
  readonly mode = "postgresql" as const;

  async ensureAdmin(username: string): Promise<void> {
    await prisma.user.upsert({ where: { id: "admin" }, create: { id: "admin", username }, update: { username } });
    await prisma.whatsAppSession.upsert({
      where: { userId: "admin" },
      create: { userId: "admin", provider: "baileys", state: "disconnected" },
      update: {},
    });
    await prisma.userPreferences.upsert({
      where: { userId: "admin" },
      create: { userId: "admin" },
      update: {},
    });
  }

  async health(): Promise<{ status: "healthy" | "degraded"; detail: string }> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "healthy", detail: "Railway PostgreSQL reachable." };
    } catch {
      return { status: "degraded", detail: "PostgreSQL did not respond to the health check." };
    }
  }

  async getSession(userId: string): Promise<SessionRecord> {
    const record = await prisma.whatsAppSession.findUnique({ where: { userId } });
    return record ? mapSession(record) : adminSession();
  }

  async setSession(userId: string, values: Partial<SessionRecord>): Promise<SessionRecord> {
    const prior = await prisma.whatsAppSession.findUnique({ where: { userId } });
    const data = {
      state: values.state ?? prior?.state ?? "disconnected",
      provider: "baileys",
      connectedAt: values.connectedAt === undefined ? prior?.connectedAt ?? null : values.connectedAt ? new Date(values.connectedAt) : null,
      lastConnectedAt: values.lastConnectedAt === undefined ? prior?.lastConnectedAt ?? null : values.lastConnectedAt ? new Date(values.lastConnectedAt) : null,
      lastErrorCode: values.lastErrorCode === undefined ? prior?.lastErrorCode ?? null : values.lastErrorCode,
    };
    const record = await prisma.whatsAppSession.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return mapSession(record);
  }

  async listMedia(userId: string, query = ""): Promise<MediaRecord[]> {
    const records = await prisma.mediaAsset.findMany({
      where: { userId, ...(query ? { fileName: { contains: query.trim(), mode: "insensitive" as const } } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return records.map(mapMedia);
  }

  async getMedia(userId: string, mediaId: string): Promise<MediaRecord | null> {
    const record = await prisma.mediaAsset.findFirst({ where: { id: mediaId, userId } });
    return record ? mapMedia(record) : null;
  }

  async createMedia(input: CreateMediaInput): Promise<MediaRecord> {
    const record = await prisma.mediaAsset.create({
      data: {
        id: input.id,
        userId: input.userId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        mediaType: input.mediaType,
        byteSize: input.byteSize,
        storageKey: input.storageKey,
        sha256: input.sha256,
        source: input.source,
      },
    });
    return mapMedia(record);
  }

  async deleteMedia(userId: string, mediaId: string): Promise<MediaRecord | null> {
    const record = await prisma.mediaAsset.findFirst({ where: { id: mediaId, userId } });
    if (!record) return null;
    await prisma.mediaAsset.delete({ where: { id: record.id } });
    return mapMedia(record);
  }

  async createDownload(input: CreateDownloadInput): Promise<DownloadRecord> {
    const record = await prisma.downloadHistory.create({ data: { ...input, errorCode: input.errorCode ?? null } });
    return mapDownload(record);
  }

  async updateDownload(userId: string, downloadId: string, status: DownloadState, errorCode: string | null = null, mediaId?: string | null, fileName?: string): Promise<DownloadRecord | null> {
    const prior = await prisma.downloadHistory.findFirst({ where: { id: downloadId, userId } });
    if (!prior) return null;
    const record = await prisma.downloadHistory.update({ where: { id: prior.id }, data: { status, errorCode, ...(mediaId === undefined ? {} : { mediaId }), ...(fileName === undefined ? {} : { fileName }), finishedAt: status === "waiting" || status === "processing" ? null : new Date() } });
    return mapDownload(record);
  }

  async listDownloads(userId: string, limit = 100): Promise<DownloadRecord[]> {
    const records = await prisma.downloadHistory.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, take: limit });
    return records.map(mapDownload);
  }

  async createActivity(input: CreateActivityInput): Promise<ActivityRecord> {
    const record = await prisma.activityLog.create({ data: input });
    return mapActivity(record);
  }

  async listActivities(userId: string, limit = 20): Promise<ActivityRecord[]> {
    const records = await prisma.activityLog.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit });
    return records.map(mapActivity);
  }

  async latestActivityId(userId: string): Promise<string | null> {
    const record = await prisma.activityLog.findFirst({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    return record?.id ?? null;
  }

  async getPreferences(userId: string): Promise<PreferencesRecord> {
    const record = await prisma.userPreferences.findUnique({ where: { userId } });
    return record ? mapPreferences(record) : defaultPreferences();
  }

  async setPreferences(userId: string, values: Partial<PreferencesRecord>): Promise<PreferencesRecord> {
    const data = {
      ...(values.retentionDays === undefined ? {} : { retentionDays: values.retentionDays }),
      ...(values.autoCleanup === undefined ? {} : { autoCleanup: values.autoCleanup }),
      ...(values.libraryView === undefined ? {} : { libraryView: values.libraryView }),
    };
    const record = await prisma.userPreferences.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return mapPreferences(record);
  }

  async countSuccessfulDownloads(userId: string): Promise<number> {
    return prisma.downloadHistory.count({ where: { userId, status: "completed" } });
  }

  async getAuthState(userId: string): Promise<string | null> {
    const record = await prisma.whatsAppSession.findUnique({ where: { userId }, select: { authStateCiphertext: true } });
    return record?.authStateCiphertext ?? null;
  }

  async setAuthState(userId: string, ciphertext: string | null): Promise<void> {
    await prisma.whatsAppSession.upsert({
      where: { userId },
      create: { userId, provider: "baileys", authStateCiphertext: ciphertext },
      update: { authStateCiphertext: ciphertext, provider: "baileys" },
      select: { id: true },
    });
  }
}
