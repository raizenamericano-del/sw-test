import { createHash, randomUUID } from "node:crypto";
import pino from "pino";
import {
  DisconnectReason,
  downloadMediaMessage,
  getCodeFromWSError,
  getContentType,
  isJidStatusBroadcast,
  makeWASocket,
  normalizeMessageContent,
  toNumber,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { createEncryptedAuthState } from "./baileys-auth";
import { withTimeout } from "./timeout";
import type { AppDatabase, SessionRecord } from "./types";
import type { ProviderCapabilities, ProviderStatus, StatusItem } from "./provider-types";
import { validateMediaBytes } from "./security";

const silentLogger = pino({ level: "silent" });
const STATUS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STATUS_CACHE_LIMIT = 500;
const PAIRING_TIMEOUT_MS = 45_000;

interface BufferedStatus {
  item: StatusItem;
  message: WAMessage;
}

interface PairingWaiter {
  phone: string;
  resolve: (value: { pairingCode: string | null }) => void;
  reject: (error: Error) => void;
  settled: boolean;
}

interface ManagedSession {
  userId: string;
  db: AppDatabase;
  socket: WASocket;
  auth: Awaited<ReturnType<typeof createEncryptedAuthState>>;
  connected: boolean;
  intentionalDisconnect: boolean;
  pairingCodeRequested: boolean;
  qrReceived: boolean;
  pairingWaiter?: PairingWaiter;
  statuses: Map<string, BufferedStatus>;
}

const globalForBaileys = globalThis as typeof globalThis & {
  imhBaileysSessions?: Map<string, ManagedSession>;
  imhBaileysConnecting?: Set<string>;
};
const sessions = globalForBaileys.imhBaileysSessions ??= new Map<string, ManagedSession>();
const connectingUsers = globalForBaileys.imhBaileysConnecting ??= new Set<string>();

function sanitizedText(value: unknown, maxLength = 1000): string | null {
  if (typeof value !== "string") return null;
  const clean = [...value].filter((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint >= 32 && codePoint !== 127;
  }).join("").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, maxLength) : null;
}

function contactLabel(message: WAMessage): string {
  const name = sanitizedText(message.pushName, 80);
  if (name) return name;
  const participant = message.key.participant || message.key.remoteJidAlt || "";
  const userPart = participant.split("@")[0].split(":")[0];
  const digits = userPart.replace(/\D/g, "");
  return digits.length >= 4 ? `Kontak ···${digits.slice(-4)}` : "Kontak WhatsApp";
}

function toStatusItem(message: WAMessage): StatusItem | null {
  const normalized = normalizeMessageContent(message.message);
  const type = getContentType(normalized);
  const timestamp = toNumber(message.messageTimestamp);
  const createdAt = new Date(timestamp > 0 ? timestamp * 1000 : Date.now()).toISOString();
  const statusId = createHash("sha256")
    .update(`${message.key.remoteJid || ""}\u0000${message.key.participant || message.key.remoteJidAlt || ""}\u0000${message.key.id || ""}`)
    .digest("hex");

  let mediaType: StatusItem["mediaType"] | null = null;
  let text: string | null = null;
  if (type === "imageMessage") {
    mediaType = "image";
    text = sanitizedText(normalized?.imageMessage?.caption);
  } else if (type === "videoMessage") {
    mediaType = "video";
    text = sanitizedText(normalized?.videoMessage?.caption);
  } else if (type === "extendedTextMessage") {
    mediaType = "text";
    text = sanitizedText(normalized?.extendedTextMessage?.text);
  } else if (type === "conversation") {
    mediaType = "text";
    text = sanitizedText(normalized?.conversation);
  }
  if (!mediaType || (!text && mediaType === "text")) return null;

  return {
    id: statusId,
    contact: contactLabel(message),
    mediaType,
    available: mediaType === "image" || mediaType === "video",
    createdAt,
    text,
  };
}

function maxMediaBytes(): number {
  const configured = Number.parseInt(process.env.MAX_UPLOAD_MB || "100", 10);
  const mb = Number.isFinite(configured) ? Math.min(Math.max(configured, 1), 500) : 100;
  return mb * 1024 * 1024;
}

function sessionErrorCode(error: unknown): string {
  if (error instanceof Error && error.message === "AUTH_STORAGE_FAILED") return "auth_storage_failed";
  const code = error instanceof Error ? getCodeFromWSError(error) : 0;
  if (code === DisconnectReason.loggedOut) return "logged_out";
  if (code === DisconnectReason.forbidden) return "forbidden";
  if (code === DisconnectReason.badSession) return "bad_session";
  return "connection_closed";
}

function rejectPairing(managed: ManagedSession, error: Error): void {
  const waiter = managed.pairingWaiter;
  if (!waiter || waiter.settled) return;
  waiter.settled = true;
  managed.pairingWaiter = undefined;
  waiter.reject(error);
}

function resolvePairing(managed: ManagedSession, pairingCode: string | null): void {
  const waiter = managed.pairingWaiter;
  if (!waiter || waiter.settled) return;
  waiter.settled = true;
  managed.pairingWaiter = undefined;
  waiter.resolve({ pairingCode });
}

export class BaileysProvider {
  readonly id = "baileys";
  readonly capabilities: ProviderCapabilities = {
    accountPairing: true,
    receivesStatuses: true,
    downloadsStatusMedia: true,
    persistentSessions: true,
    statusFeedExperimental: true,
    official: false,
  };

  status(): ProviderStatus {
    return {
      supported: true,
      provider: this.id,
      connected: false,
      items: [],
      capabilities: { ...this.capabilities },
      message: "Baileys adalah library WhatsApp Web tidak resmi. Feed Status bersifat eksperimental dan tidak dijamin oleh upstream; aplikasi hanya menampilkan event Status yang benar-benar diterima akun tertaut selama proses aktif. Tidak ada pengambilan tersembunyi atau bypass privasi.",
    };
  }

  async getSession(userId: string, db: AppDatabase): Promise<SessionRecord> {
    let managed = sessions.get(userId);
    let hasEncryptedAuth = false;
    if (!managed) {
      const encryptedState = await db.getAuthState(userId);
      hasEncryptedAuth = Boolean(encryptedState);
      if (encryptedState) {
        try {
          await db.setSession(userId, { state: "connecting", connectedAt: null, lastErrorCode: null });
          managed = await this.startSocket(userId, db);
        } catch (error) {
          await db.setSession(userId, { state: "disconnected", connectedAt: null, lastErrorCode: error instanceof Error && error.name === "AuthEncryptionError" ? "auth_key_unavailable" : "connection_failed" });
        }
      }
    }
    const stored = await db.getSession(userId);
    const live = sessions.get(userId);
    if (live?.connected && stored.state !== "connected") {
      return db.setSession(userId, { state: "connected", connectedAt: stored.connectedAt ?? new Date().toISOString(), lastConnectedAt: new Date().toISOString(), lastErrorCode: null });
    }
    if (!live && stored.state !== "disconnected") {
      return db.setSession(userId, { state: "disconnected", connectedAt: null, lastErrorCode: hasEncryptedAuth ? stored.lastErrorCode ?? "connection_failed" : "credentials_missing" });
    }
    return stored;
  }

  async connect(userId: string, phone: string, db: AppDatabase): Promise<{ session: SessionRecord; pairingCode: string | null }> {
    const current = sessions.get(userId);
    if (current?.connected) return { session: await db.getSession(userId), pairingCode: null };
    if (connectingUsers.has(userId) || current?.pairingCodeRequested || (current?.pairingWaiter && !current.pairingWaiter.settled)) throw new Error("CONNECTION_ALREADY_IN_PROGRESS");
    connectingUsers.add(userId);
    let managed: ManagedSession | undefined;
    try {
      await db.setSession(userId, { state: "connecting", connectedAt: null, lastErrorCode: null });
      managed = current ?? await this.startSocket(userId, db);
      const pending = new Promise<{ pairingCode: string | null }>((resolve, reject) => {
        managed!.pairingWaiter = { phone, resolve, reject, settled: false };
        if (managed!.connected) resolvePairing(managed!, null);
        else void this.requestPairingCodeWhenReady(managed!);
      });
      let result: { pairingCode: string | null };
      try {
        result = await withTimeout(pending, PAIRING_TIMEOUT_MS, "PAIRING_TIMEOUT");
      } catch (error) {
        const message = error instanceof Error ? error.message : "PAIRING_FAILED";
        rejectPairing(managed, error instanceof Error ? error : new Error(message));
        if (message === "PAIRING_TIMEOUT" || message === "PAIRING_FAILED" || message === "AUTH_STORAGE_FAILED") {
          managed.intentionalDisconnect = true;
          sessions.delete(userId);
          await managed.socket.end(new Error("Pairing attempt ended.")).catch(() => undefined);
          await managed.auth.disableAndClear().catch(() => undefined);
          await db.setSession(userId, { state: "disconnected", connectedAt: null, lastErrorCode: message === "PAIRING_TIMEOUT" ? "pairing_timeout" : message === "AUTH_STORAGE_FAILED" ? "auth_storage_failed" : "pairing_failed" }).catch(() => undefined);
        }
        throw error;
      }
      return { session: await db.getSession(userId), pairingCode: result.pairingCode };
    } catch (error) {
      const message = error instanceof Error ? error.message : "CONNECTION_FAILED";
      if (["PAIRING_TIMEOUT", "PAIRING_FAILED", "CONNECTION_FAILED", "AUTH_STORAGE_FAILED", "CONNECTION_ALREADY_IN_PROGRESS", "DISCONNECTED"].includes(message)) throw error;
      await db.setSession(userId, { state: "disconnected", connectedAt: null, lastErrorCode: "connection_failed" }).catch(() => undefined);
      throw error;
    } finally {
      connectingUsers.delete(userId);
    }
  }

  async disconnect(userId: string, db: AppDatabase): Promise<SessionRecord> {
    const managed = sessions.get(userId);
    if (managed) {
      managed.intentionalDisconnect = true;
      rejectPairing(managed, new Error("DISCONNECTED"));
      try { await withTimeout(managed.socket.logout(), 5_000, "LOGOUT_TIMEOUT"); }
      catch {
        await managed.socket.end(new Error("Local disconnect requested.")).catch(() => undefined);
      }
      sessions.delete(userId);
      managed.statuses.clear();
      await managed.auth.disableAndClear();
    } else {
      await db.setAuthState(userId, null);
    }
    const previous = await db.getSession(userId);
    const session = await db.setSession(userId, { state: "disconnected", connectedAt: null, lastErrorCode: null });
    if (previous.state !== "disconnected") {
      await db.createActivity({ id: `session-disconnected-${Date.now()}`, userId, type: "session_disconnected", message: "Perangkat tertaut WhatsApp diputus dari aplikasi." }).catch(() => undefined);
    }
    return session;
  }

  async listStatuses(userId: string, db: AppDatabase): Promise<ProviderStatus> {
    const session = await this.getSession(userId, db);
    const managed = sessions.get(userId);
    const now = Date.now();
    if (managed) {
      for (const [id, status] of managed.statuses) {
        if (now - Date.parse(status.item.createdAt) > STATUS_MAX_AGE_MS) managed.statuses.delete(id);
      }
    }
    const items = managed
      ? [...managed.statuses.values()].map(({ item }) => item).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      : [];
    return {
      ...this.status(),
      connected: session.state === "connected",
      connectionState: session.state,
      items,
      message: session.state === "connected"
        ? "Status Center eksperimental. Hanya event Status nyata yang diterima akun tertaut dan masih tersimpan di memori proses saat ini yang muncul. Baileys tidak menjamin feed masuk stabil; konten yang tidak diterima tidak ditampilkan atau dicari secara tersembunyi."
        : "Baileys belum terhubung. Hubungkan akun milik Anda sendiri untuk menerima event yang memang dikirim ke perangkat tertaut. Feed Status tetap eksperimental dan tidak menjamin semua Status tersedia.",
    };
  }

  async downloadStatusMedia(userId: string, statusId: string): Promise<{ bytes: Buffer; mimeType: string; mediaType: "image" | "video"; extension: string; fileName: string }> {
    const managed = sessions.get(userId);
    const status = managed?.statuses.get(statusId);
    if (!managed?.connected || !status || !status.item.available || status.item.mediaType === "text") throw new Error("STATUS_NOT_AVAILABLE");
    if (Date.now() - Date.parse(status.item.createdAt) > STATUS_MAX_AGE_MS) {
      managed.statuses.delete(statusId);
      throw new Error("STATUS_EXPIRED");
    }
    const bytes = await downloadMediaMessage(status.message, "buffer", {}, {
      logger: silentLogger,
      reuploadRequest: managed.socket.updateMediaMessage,
    });
    if (bytes.byteLength > maxMediaBytes()) throw new Error("STATUS_MEDIA_TOO_LARGE");
    const declaredMime = this.statusMime(status.message);
    const verified = validateMediaBytes(bytes, declaredMime);
    if (!verified) throw new Error("STATUS_MEDIA_UNSUPPORTED");
    const date = new Date(status.item.createdAt).toISOString().replace(/[:.]/g, "-");
    const contact = status.item.contact.replace(/[^\p{L}\p{N}-]+/gu, "-").slice(0, 30) || "kontak";
    const fileName = `status-${contact}-${date}${verified.extension}`;
    return { bytes, mimeType: verified.mimeType, mediaType: verified.mediaType, extension: verified.extension, fileName };
  }

  private statusMime(message: WAMessage): string {
    const normalized = normalizeMessageContent(message.message);
    const type = getContentType(normalized);
    if (type === "imageMessage") return normalized?.imageMessage?.mimetype || "application/octet-stream";
    if (type === "videoMessage") return normalized?.videoMessage?.mimetype || "application/octet-stream";
    return "application/octet-stream";
  }

  private async requestPairingCodeWhenReady(managed: ManagedSession): Promise<void> {
    const waiter = managed.pairingWaiter;
    if (!waiter || waiter.settled || managed.pairingCodeRequested || managed.socket.authState.creds.registered || !managed.qrReceived) return;
    if (!managed.socket.ws.isOpen) return;
    managed.pairingCodeRequested = true;
    try {
      const pairingCode = await managed.socket.requestPairingCode(waiter.phone);
      if (!/^\d{8}$/.test(pairingCode.replace(/\D/g, ""))) throw new Error("PAIRING_FAILED");
      resolvePairing(managed, pairingCode);
    } catch {
      rejectPairing(managed, new Error("PAIRING_FAILED"));
    }
  }

  private async startSocket(userId: string, db: AppDatabase): Promise<ManagedSession> {
    const existing = sessions.get(userId);
    if (existing) return existing;
    const auth = await createEncryptedAuthState(db, userId);
    const socket = makeWASocket({
      auth: auth.state,
      logger: silentLogger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      printQRInTerminal: false,
    });
    const managed: ManagedSession = {
      userId,
      db,
      socket,
      auth,
      connected: false,
      intentionalDisconnect: false,
      pairingCodeRequested: false,
      qrReceived: false,
      statuses: new Map(),
    };
    sessions.set(userId, managed);

    socket.ev.on("creds.update", () => {
      void auth.saveCreds().catch(async () => {
        if (managed.intentionalDisconnect) return;
        managed.intentionalDisconnect = true;
        rejectPairing(managed, new Error("AUTH_STORAGE_FAILED"));
        sessions.delete(userId);
        await db.setSession(userId, { state: "disconnected", connectedAt: null, lastErrorCode: "auth_storage_failed" }).catch(() => undefined);
        await socket.end(new Error("Encrypted auth storage failed.")).catch(() => undefined);
      });
    });
    socket.ev.on("messages.upsert", ({ messages }) => {
      void this.captureStatuses(managed, messages);
    });
    socket.ev.on("connection.update", (update) => {
      if (update.qr) {
        managed.qrReceived = true;
        if (managed.pairingWaiter && !managed.pairingWaiter.settled) void this.requestPairingCodeWhenReady(managed);
      }
      if (update.connection === "open") void this.onOpen(managed);
      if (update.connection === "close") void this.onClose(managed, update.lastDisconnect?.error);
    });
    return managed;
  }

  private async captureStatuses(managed: ManagedSession, messages: WAMessage[]): Promise<void> {
    let received = 0;
    for (const message of messages) {
      const remoteJid = message.key.remoteJid;
      if (!remoteJid || !isJidStatusBroadcast(remoteJid) || !message.key.id) continue;
      const item = toStatusItem(message);
      if (!item) continue;
      if (!managed.statuses.has(item.id)) received += 1;
      managed.statuses.set(item.id, { item, message });
    }
    const entries = [...managed.statuses.entries()].sort((left, right) => left[1].item.createdAt.localeCompare(right[1].item.createdAt));
    while (entries.length > STATUS_CACHE_LIMIT) {
      const [oldestId] = entries.shift()!;
      managed.statuses.delete(oldestId);
    }
    if (received > 0) {
      await managed.db.createActivity({
        id: randomUUID(),
        userId: managed.userId,
        type: "status_available",
        message: `${received} event Status WhatsApp diterima dari sesi tertaut.`,
      }).catch(() => undefined);
    }
  }

  private async onOpen(managed: ManagedSession): Promise<void> {
    if (managed.intentionalDisconnect) return;
    const wasConnected = managed.connected;
    managed.connected = true;
    const prior = await managed.db.getSession(managed.userId).catch(() => null);
    const now = new Date().toISOString();
    await managed.db.setSession(managed.userId, {
      state: "connected",
      connectedAt: prior?.connectedAt ?? now,
      lastConnectedAt: now,
      lastErrorCode: null,
    }).catch(() => undefined);
    if (!wasConnected) {
      await managed.db.createActivity({ id: `session-connected-${Date.now()}`, userId: managed.userId, type: "session_connected", message: "Perangkat tertaut WhatsApp benar-benar terhubung." }).catch(() => undefined);
    }
    resolvePairing(managed, null);
  }

  private async onClose(managed: ManagedSession, error: unknown): Promise<void> {
    managed.connected = false;
    if (managed.intentionalDisconnect) return;
    const code = sessionErrorCode(error);
    rejectPairing(managed, new Error(code === "auth_storage_failed" ? "AUTH_STORAGE_FAILED" : "CONNECTION_FAILED"));
    if (code === "logged_out") await managed.auth.disableAndClear().catch(() => undefined);
    if (sessions.get(managed.userId) === managed) sessions.delete(managed.userId);
    const prior = await managed.db.getSession(managed.userId).catch(() => null);
    await managed.db.setSession(managed.userId, { state: "disconnected", connectedAt: null, lastErrorCode: code }).catch(() => undefined);
    if (prior?.state === "connected") {
      await managed.db.createActivity({ id: `session-closed-${Date.now()}`, userId: managed.userId, type: "session_disconnected", message: "Koneksi WhatsApp tertutup; status diperbarui dari backend." }).catch(() => undefined);
    }
  }
}
