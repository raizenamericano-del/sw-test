export type MediaType = "image" | "video";
export type DownloadState = "waiting" | "processing" | "completed" | "failed";
export type SessionState = "disconnected" | "connecting" | "connected";
export type ProviderId = "baileys";
export type ActivityType =
  | "session_connected"
  | "session_disconnected"
  | "status_available"
  | "download_completed"
  | "download_failed"
  | "media_imported"
  | "media_deleted"
  | "settings_updated";

export interface SessionRecord {
  state: SessionState;
  provider: ProviderId;
  connectedAt: string | null;
  lastConnectedAt: string | null;
  lastErrorCode: string | null;
  updatedAt: string;
}

export interface MediaRecord {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  mediaType: MediaType;
  byteSize: number;
  storageKey: string;
  sha256: string | null;
  source: "manual-import" | "provider";
  createdAt: string;
}

export interface DownloadRecord {
  id: string;
  userId: string;
  mediaId: string | null;
  fileName: string;
  status: DownloadState;
  startedAt: string;
  finishedAt: string | null;
  errorCode: string | null;
}

export interface ActivityRecord {
  id: string;
  userId: string;
  type: ActivityType;
  message: string;
  createdAt: string;
}

export interface PreferencesRecord {
  retentionDays: number;
  autoCleanup: boolean;
  libraryView: "grid" | "list";
  updatedAt: string;
}

export interface CreateMediaInput {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  mediaType: MediaType;
  byteSize: number;
  storageKey: string;
  sha256: string;
  source: MediaRecord["source"];
}

export interface CreateDownloadInput {
  id: string;
  userId: string;
  mediaId: string | null;
  fileName: string;
  status: DownloadState;
  errorCode?: string | null;
}

export interface CreateActivityInput {
  id: string;
  userId: string;
  type: ActivityType;
  message: string;
}

export interface AppDatabase {
  readonly mode: "local-json" | "postgresql";
  ensureAdmin(username: string): Promise<void>;
  health(): Promise<{ status: "healthy" | "degraded"; detail: string }>;
  getSession(userId: string): Promise<SessionRecord>;
  setSession(userId: string, values: Partial<SessionRecord>): Promise<SessionRecord>;
  listMedia(userId: string, query?: string): Promise<MediaRecord[]>;
  getMedia(userId: string, mediaId: string): Promise<MediaRecord | null>;
  createMedia(input: CreateMediaInput): Promise<MediaRecord>;
  deleteMedia(userId: string, mediaId: string): Promise<MediaRecord | null>;
  createDownload(input: CreateDownloadInput): Promise<DownloadRecord>;
  updateDownload(userId: string, downloadId: string, status: DownloadState, errorCode?: string | null, mediaId?: string | null, fileName?: string): Promise<DownloadRecord | null>;
  listDownloads(userId: string, limit?: number): Promise<DownloadRecord[]>;
  createActivity(input: CreateActivityInput): Promise<ActivityRecord>;
  listActivities(userId: string, limit?: number): Promise<ActivityRecord[]>;
  latestActivityId(userId: string): Promise<string | null>;
  getPreferences(userId: string): Promise<PreferencesRecord>;
  setPreferences(userId: string, values: Partial<PreferencesRecord>): Promise<PreferencesRecord>;
  countSuccessfulDownloads(userId: string): Promise<number>;
  getAuthState(userId: string): Promise<string | null>;
  setAuthState(userId: string, ciphertext: string | null): Promise<void>;
}

export interface DashboardData {
  username: string;
  session: SessionRecord;
  stats: {
    accessibleStatuses: number | null;
    libraryItems: number;
    successfulDownloads: number;
  };
  activities: ActivityRecord[];
  health: {
    api: "healthy" | "degraded";
    database: { status: "healthy" | "degraded"; mode: string; detail: string };
    storage: { status: "healthy" | "degraded"; driver: string; persistent: boolean; detail: string };
    whatsapp: "unsupported" | "not-configured" | "experimental";
  };
}
