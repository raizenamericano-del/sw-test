import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSafeStorageKey } from "./security";

export class StorageError extends Error {
  constructor(public readonly code: "STORAGE_NOT_CONFIGURED" | "STORAGE_NOT_FOUND" | "STORAGE_FAILED", message: string) {
    super(message);
    this.name = "StorageError";
  }
}

export interface MediaStorage {
  readonly driver: "local" | "s3" | "unavailable";
  readonly persistent: boolean;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  health(): Promise<{ status: "healthy" | "degraded"; detail: string }>;
}

function localRoot(): string {
  const configured = process.env.DATA_DIR || path.join(process.cwd(), ".data");
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured);
}

function localPath(key: string): string {
  const safeKey = assertSafeStorageKey(key);
  const root = localRoot();
  const target = path.resolve(/*turbopackIgnore: true*/ root, ...safeKey.split("/"));
  if (!target.startsWith(`${root}${path.sep}`)) throw new StorageError("STORAGE_FAILED", "Unsafe storage path.");
  return target;
}

class LocalMediaStorage implements MediaStorage {
  readonly driver = "local" as const;
  readonly persistent = false;

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const destination = localPath(key);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { mode: 0o600, flag: "wx" });
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(localPath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new StorageError("STORAGE_FAILED", "Stored media could not be read.");
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await rm(localPath(key), { force: true });
    } catch {
      throw new StorageError("STORAGE_FAILED", "Stored media could not be removed.");
    }
  }

  async health(): Promise<{ status: "healthy" | "degraded"; detail: string }> {
    try {
      await mkdir(localRoot(), { recursive: true });
      return { status: "healthy", detail: "Local development storage; not persistent across Railway restarts." };
    } catch {
      return { status: "degraded", detail: "Local media directory is not writable." };
    }
  }
}

class S3MediaStorage implements MediaStorage {
  readonly driver = "s3" as const;
  readonly persistent = true;
  private readonly bucket = process.env.S3_BUCKET!;
  private readonly client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
      : undefined,
  });

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: assertSafeStorageKey(key), Body: bytes, ContentType: contentType }), { abortSignal: AbortSignal.timeout(15_000) });
    } catch {
      throw new StorageError("STORAGE_FAILED", "Persistent media storage could not save the file.");
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: assertSafeStorageKey(key) }), { abortSignal: AbortSignal.timeout(20_000) });
      if (!result.Body) return null;
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey" || (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw new StorageError("STORAGE_FAILED", "Persistent media storage could not return the file.");
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: assertSafeStorageKey(key) }), { abortSignal: AbortSignal.timeout(15_000) });
    } catch {
      throw new StorageError("STORAGE_FAILED", "Persistent media storage could not remove the file.");
    }
  }

  async health(): Promise<{ status: "healthy" | "degraded"; detail: string }> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), { abortSignal: AbortSignal.timeout(8_000) });
      return { status: "healthy", detail: "S3-compatible persistent bucket reachable." };
    } catch {
      return { status: "degraded", detail: "S3 bucket could not be reached with the configured credentials." };
    }
  }
}

class UnavailableStorage implements MediaStorage {
  readonly driver = "unavailable" as const;
  readonly persistent = false;
  async put(): Promise<void> { throw new StorageError("STORAGE_NOT_CONFIGURED", "Configure an S3-compatible bucket before storing media in production."); }
  async get(): Promise<null> { throw new StorageError("STORAGE_NOT_CONFIGURED", "Configure an S3-compatible bucket before serving media in production."); }
  async delete(): Promise<void> { throw new StorageError("STORAGE_NOT_CONFIGURED", "Configure an S3-compatible bucket before deleting media in production."); }
  async health(): Promise<{ status: "healthy" | "degraded"; detail: string }> { return { status: "degraded", detail: "S3-compatible storage is required in production." }; }
}

let storageInstance: MediaStorage | undefined;
export function getStorage(): MediaStorage {
  if (storageInstance) return storageInstance;
  if (process.env.S3_BUCKET) storageInstance = new S3MediaStorage();
  else if (process.env.NODE_ENV === "production") storageInstance = new UnavailableStorage();
  else storageInstance = new LocalMediaStorage();
  return storageInstance;
}

export function resetStorageForTests(): void {
  storageInstance = undefined;
}
