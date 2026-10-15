import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
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

interface JsonState {
  adminUsername: string;
  sessions: Record<string, SessionRecord>;
  media: MediaRecord[];
  downloads: DownloadRecord[];
  activities: ActivityRecord[];
  preferences: Record<string, PreferencesRecord>;
  authStates: Record<string, string>;
}

function defaultSession(): SessionRecord {
  return {
    state: "disconnected",
    provider: "baileys",
    connectedAt: null,
    lastConnectedAt: null,
    lastErrorCode: null,
    updatedAt: new Date().toISOString(),
  };
}

function defaultPreferences(): PreferencesRecord {
  return { retentionDays: 30, autoCleanup: true, libraryView: "grid", updatedAt: new Date().toISOString() };
}

function emptyState(): JsonState {
  return { adminUsername: "admin", sessions: {}, media: [], downloads: [], activities: [], preferences: {}, authStates: {} };
}

export class JsonDatabase implements AppDatabase {
  readonly mode = "local-json" as const;
  private readonly filePath: string;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(dataDir = process.env.DATA_DIR || path.join(process.cwd(), ".data")) {
    this.filePath = path.join(dataDir, "state.json");
  }

  private async readState(): Promise<JsonState> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as JsonState;
      return {
        ...emptyState(),
        ...parsed,
        sessions: parsed.sessions ?? {},
        media: parsed.media ?? [],
        downloads: parsed.downloads ?? [],
        activities: parsed.activities ?? [],
        preferences: parsed.preferences ?? {},
        authStates: parsed.authStates ?? {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw new Error("Local database could not be read.");
    }
  }

  private async writeState(state: JsonState): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, this.filePath);
  }

  private async mutate<T>(operation: (state: JsonState) => T | Promise<T>): Promise<T> {
    const run = this.writeQueue.then(async () => {
      const state = await this.readState();
      const result = await operation(state);
      await this.writeState(state);
      return result;
    });
    this.writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  async ensureAdmin(username: string): Promise<void> {
    await this.mutate((state) => {
      state.adminUsername = username;
      state.sessions.admin ??= defaultSession();
      state.preferences.admin ??= defaultPreferences();
    });
  }

  async health(): Promise<{ status: "healthy" | "degraded"; detail: string }> {
    try {
      await this.readState();
      return { status: "healthy", detail: "Local JSON store; single-instance development mode." };
    } catch {
      return { status: "degraded", detail: "Local data store could not be read." };
    }
  }

  async getSession(userId: string): Promise<SessionRecord> {
    const state = await this.readState();
    const stored = state.sessions[userId];
    return stored ? { ...stored, provider: "baileys" } : defaultSession();
  }

  async setSession(userId: string, values: Partial<SessionRecord>): Promise<SessionRecord> {
    return this.mutate((state) => {
      const next = { ...(state.sessions[userId] ?? defaultSession()), ...values, provider: "baileys" as const, updatedAt: new Date().toISOString() };
      state.sessions[userId] = next;
      return next;
    });
  }

  async listMedia(userId: string, query = ""): Promise<MediaRecord[]> {
    const state = await this.readState();
    const needle = query.trim().toLocaleLowerCase();
    return state.media
      .filter((item) => item.userId === userId && (!needle || item.fileName.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getMedia(userId: string, mediaId: string): Promise<MediaRecord | null> {
    const state = await this.readState();
    return state.media.find((item) => item.id === mediaId && item.userId === userId) ?? null;
  }

  async createMedia(input: CreateMediaInput): Promise<MediaRecord> {
    return this.mutate((state) => {
      if (state.media.some((item) => item.id === input.id || item.storageKey === input.storageKey)) throw new Error("DUPLICATE_MEDIA");
      const record: MediaRecord = { ...input, createdAt: new Date().toISOString() };
      state.media.push(record);
      return record;
    });
  }

  async deleteMedia(userId: string, mediaId: string): Promise<MediaRecord | null> {
    return this.mutate((state) => {
      const index = state.media.findIndex((item) => item.id === mediaId && item.userId === userId);
      if (index < 0) return null;
      const [deleted] = state.media.splice(index, 1);
      for (const download of state.downloads) if (download.mediaId === mediaId) download.mediaId = null;
      return deleted;
    });
  }

  async createDownload(input: CreateDownloadInput): Promise<DownloadRecord> {
    return this.mutate((state) => {
      const record: DownloadRecord = {
        ...input,
        errorCode: input.errorCode ?? null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
      };
      state.downloads.unshift(record);
      return record;
    });
  }

  async updateDownload(userId: string, downloadId: string, status: DownloadState, errorCode: string | null = null, mediaId?: string | null, fileName?: string): Promise<DownloadRecord | null> {
    return this.mutate((state) => {
      const record = state.downloads.find((item) => item.id === downloadId && item.userId === userId);
      if (!record) return null;
      record.status = status;
      record.errorCode = errorCode;
      if (mediaId !== undefined) record.mediaId = mediaId;
      if (fileName !== undefined) record.fileName = fileName;
      record.finishedAt = status === "waiting" || status === "processing" ? null : new Date().toISOString();
      return record;
    });
  }

  async listDownloads(userId: string, limit = 100): Promise<DownloadRecord[]> {
    const state = await this.readState();
    return state.downloads.filter((item) => item.userId === userId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  }

  async createActivity(input: CreateActivityInput): Promise<ActivityRecord> {
    return this.mutate((state) => {
      const record: ActivityRecord = { ...input, createdAt: new Date().toISOString() };
      state.activities.unshift(record);
      state.activities = state.activities.slice(0, 1000);
      return record;
    });
  }

  async listActivities(userId: string, limit = 20): Promise<ActivityRecord[]> {
    const state = await this.readState();
    return state.activities.filter((item) => item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async latestActivityId(userId: string): Promise<string | null> {
    const latest = (await this.listActivities(userId, 1))[0];
    return latest?.id ?? null;
  }

  async getPreferences(userId: string): Promise<PreferencesRecord> {
    const state = await this.readState();
    return state.preferences[userId] ?? defaultPreferences();
  }

  async setPreferences(userId: string, values: Partial<PreferencesRecord>): Promise<PreferencesRecord> {
    return this.mutate((state) => {
      const next = { ...(state.preferences[userId] ?? defaultPreferences()), ...values, updatedAt: new Date().toISOString() };
      state.preferences[userId] = next;
      return next;
    });
  }

  async countSuccessfulDownloads(userId: string): Promise<number> {
    const state = await this.readState();
    return state.downloads.filter((item) => item.userId === userId && item.status === "completed").length;
  }

  async getAuthState(userId: string): Promise<string | null> {
    const state = await this.readState();
    return state.authStates[userId] ?? null;
  }

  async setAuthState(userId: string, ciphertext: string | null): Promise<void> {
    await this.mutate((state) => {
      if (ciphertext === null) delete state.authStates[userId];
      else state.authStates[userId] = ciphertext;
    });
  }
}
