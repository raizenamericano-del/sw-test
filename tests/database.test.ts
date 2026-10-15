import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonDatabase } from "../src/lib/db/json-database";
import { getStorage, resetStorageForTests } from "../src/lib/storage";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
let tempDir = "";
afterEach(async () => {
  resetStorageForTests();
  vi.unstubAllEnvs();
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = "";
});

describe("local JSON database", () => {
  it("persists actual state and isolates resources by user id", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "imh-db-test-"));
    const db = new JsonDatabase(tempDir);
    await db.ensureAdmin("admin");
    const media = await db.createMedia({
      id: "media-unique-0001",
      userId: "admin",
      fileName: "owned.png",
      mimeType: "image/png",
      mediaType: "image",
      byteSize: png.byteLength,
      storageKey: "media/admin/media-unique-0001.png",
      sha256: "abc123",
      source: "manual-import",
    });
    expect(media.fileName).toBe("owned.png");
    expect(await db.getMedia("another-user", media.id)).toBeNull();
    expect(await db.listMedia("another-user")).toEqual([]);
    const reopened = new JsonDatabase(tempDir);
    expect((await reopened.listMedia("admin")).map((item) => item.id)).toEqual([media.id]);
  });

  it("tracks session state, download transitions, and activity without sensitive payloads", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "imh-db-test-"));
    const db = new JsonDatabase(tempDir);
    await db.ensureAdmin("admin");
    const session = await db.getSession("admin");
    expect(session.state).toBe("disconnected");
    const download = await db.createDownload({ id: "download-unique-1", userId: "admin", mediaId: null, fileName: "sample.mp4", status: "waiting" });
    expect((await db.updateDownload("admin", download.id, "processing"))?.status).toBe("processing");
    expect((await db.updateDownload("admin", download.id, "completed"))?.status).toBe("completed");
    expect(await db.countSuccessfulDownloads("admin")).toBe(1);
    await db.createActivity({ id: "activity-1", userId: "admin", type: "download_completed", message: "Download selesai." });
    expect(await db.latestActivityId("admin")).toBe("activity-1");
  });
});

describe("local media storage", () => {
  it("writes, reads, and removes media using safe storage keys", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "imh-storage-test-"));
    vi.stubEnv("DATA_DIR", tempDir);
    const storage = getStorage();
    const key = "media/admin/4b4f0834-4b8c-4d23-a9e7-1263bc716ab3.png";
    await storage.put(key, png, "image/png");
    expect(await storage.get(key)).toEqual(png);
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });
});
