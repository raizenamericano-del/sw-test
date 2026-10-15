import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
  type SignalKeyStore,
} from "@whiskeysockets/baileys";
import type { AppDatabase } from "./types";

const ENVELOPE_PREFIX = "imh-auth-v1";

export class AuthEncryptionError extends Error {
  constructor(message = "WHATSAPP_AUTH_ENCRYPTION_KEY is missing or invalid.") {
    super(message);
    this.name = "AuthEncryptionError";
  }
}

interface SerializedAuthState {
  creds: AuthenticationCreds;
  keys: Record<string, Record<string, unknown>>;
}

function encryptionKey(): Buffer {
  const configured = process.env.WHATSAPP_AUTH_ENCRYPTION_KEY?.trim();
  if (!configured) throw new AuthEncryptionError();
  const key = /^[a-f0-9]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");
  if (key.byteLength !== 32) throw new AuthEncryptionError();
  return key;
}

export function encryptAuthState(state: SerializedAuthState, key = encryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(state, BufferJSON.replacer), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptAuthState(value: string, key = encryptionKey()): SerializedAuthState {
  const [prefix, encodedIv, encodedTag, encodedCiphertext, extra] = value.split(".");
  if (prefix !== ENVELOPE_PREFIX || !encodedIv || !encodedTag || !encodedCiphertext || extra !== undefined) {
    throw new AuthEncryptionError("Stored WhatsApp credentials could not be decrypted.");
  }
  try {
    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    if (iv.byteLength !== 12 || tag.byteLength !== 16 || ciphertext.byteLength === 0) throw new Error("Invalid auth envelope");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const state = JSON.parse(plaintext.toString("utf8"), BufferJSON.reviver) as SerializedAuthState;
    if (!state?.creds || typeof state.keys !== "object" || state.keys === null) throw new Error("Invalid auth payload");
    return state;
  } catch {
    throw new AuthEncryptionError("Stored WhatsApp credentials could not be decrypted. Check WHATSAPP_AUTH_ENCRYPTION_KEY; it must remain unchanged.");
  }
}

export async function createEncryptedAuthState(db: AppDatabase, userId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  disableAndClear: () => Promise<void>;
}> {
  const key = encryptionKey();
  const saved = await db.getAuthState(userId);
  const parsed = saved ? decryptAuthState(saved, key) : null;
  let creds = parsed?.creds ?? initAuthCreds();
  const keyData = parsed?.keys ?? {};
  let disabled = false;
  let writeQueue: Promise<void> = Promise.resolve();

  const persist = (): Promise<void> => {
    const write = writeQueue.then(async () => {
      if (disabled) return;
      await db.setAuthState(userId, encryptAuthState({ creds, keys: keyData }, key));
    });
    writeQueue = write.catch(() => undefined);
    return write;
  };

  const keys: SignalKeyStore = {
    async get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]): Promise<{ [id: string]: SignalDataTypeMap[T] }> {
      const bucket = keyData[type] ?? {};
      const result: Record<string, unknown> = {};
      for (const id of ids) {
        let value = bucket[id];
        if (type === "app-state-sync-key" && value) {
          value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
        }
        if (value !== undefined && value !== null) result[id] = value;
      }
      return result as { [id: string]: SignalDataTypeMap[T] };
    },
    async set(data: SignalDataSet): Promise<void> {
      for (const [category, values] of Object.entries(data) as Array<[keyof SignalDataTypeMap, Record<string, unknown> | undefined]>) {
        if (!values) continue;
        const bucket = keyData[category] ?? (keyData[category] = {});
        for (const [id, value] of Object.entries(values)) {
          if (value === null || value === undefined) delete bucket[id];
          else bucket[id] = value;
        }
        if (Object.keys(bucket).length === 0) delete keyData[category];
      }
      await persist();
    },
    async clear(): Promise<void> {
      for (const category of Object.keys(keyData)) delete keyData[category];
      creds = initAuthCreds();
      await persist();
    },
  };

  return {
    state: { creds, keys },
    saveCreds: persist,
    async disableAndClear() {
      disabled = true;
      await writeQueue;
      await db.setAuthState(userId, null);
    },
  };
}
