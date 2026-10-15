import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { POST as login } from "../app/api/auth/login/route";
import { GET as me } from "../app/api/auth/me/route";
import { GET as libraryGet } from "../app/api/library/route";
import { POST as upload } from "../app/api/library/upload/route";
import { GET as contentGet } from "../app/api/media/[id]/content/route";
import { POST as downloadPost } from "../app/api/media/[id]/download/route";
import { DELETE as mediaDelete } from "../app/api/media/[id]/route";
import { GET as historyGet } from "../app/api/history/route";
import { GET as statusesGet } from "../app/api/statuses/route";
import { POST as connectPost } from "../app/api/session/connect/route";
import { GET as sessionGet } from "../app/api/session/route";
import { resetDatabaseForTests } from "../src/lib/db";
import { getStorage, resetStorageForTests } from "../src/lib/storage";

let dataDir = "";
let cookie = "";
const origin = "http://localhost:3000";
const pixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6uoAAAAASUVORK5CYII=", "base64");

function request(url: string, init: RequestInit = {}, authenticated = true): Request {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") headers.set("Origin", origin);
  if (authenticated && cookie) headers.set("Cookie", cookie);
  return new Request(`${origin}${url}`, { ...init, headers });
}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "imh-api-test-"));
  vi.stubEnv("DATA_DIR", dataDir);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("S3_BUCKET", "");
  resetDatabaseForTests();
  resetStorageForTests();
});

afterAll(async () => {
  resetDatabaseForTests();
  resetStorageForTests();
  vi.unstubAllEnvs();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

describe("admin API integration", () => {
  it("rejects cross-origin login and invalid credentials; issues a valid admin session", async () => {
    const crossOrigin = await login(new Request(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "imhub-demo-2026" }),
    }));
    expect(crossOrigin.status).toBe(403);

    const badLogin = await login(request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "wrong" }),
    }, false));
    expect(badLogin.status).toBe(401);

    const accepted = await login(request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "imhub-demo-2026" }),
    }, false));
    expect(accepted.status).toBe(200);
    const setCookie = accepted.headers.get("set-cookie");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=strict");
    cookie = setCookie!.split(";")[0];
    const identity = await me(request("/api/auth/me"));
    expect(identity.status).toBe(200);
    expect(await identity.json()).toMatchObject({ authenticated: true, user: { username: "admin" } });
    expect((await libraryGet(request("/api/library"))).status).toBe(200);
    expect((await libraryGet(request("/api/library", {}, false))).status).toBe(401);

    const sessionStatus = await sessionGet(request("/api/session"));
    expect(sessionStatus.status).toBe(200);
    expect(await sessionStatus.json()).toMatchObject({ session: { state: "disconnected", provider: "baileys" }, capabilities: { accountPairing: true, statusFeedExperimental: true } });

    const statusFeed = await statusesGet(request("/api/statuses"));
    expect(statusFeed.status).toBe(200);
    expect(await statusFeed.json()).toMatchObject({ supported: true, provider: "baileys", connected: false, items: [], capabilities: { statusFeedExperimental: true, official: false } });

    const invalidPhone = await connectPost(request("/api/session/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "abc" }) }));
    expect(invalidPhone.status).toBe(400);
    vi.stubEnv("WHATSAPP_AUTH_ENCRYPTION_KEY", "");
    const missingKey = await connectPost(request("/api/session/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "6281234567890" }) }));
    expect(missingKey.status).toBe(503);
    expect(await missingKey.json()).toMatchObject({ error: { code: "auth_encryption_not_configured" } });
  });

  it("uploads, previews, downloads, records history, rejects duplicates, and deletes only the stored media", async () => {
    const form = new FormData();
    form.append("file", new File([pixelPng], "pixel.png", { type: "image/png" }));
    const uploaded = await upload(request("/api/library/upload", { method: "POST", body: form }));
    expect(uploaded.status).toBe(201);
    const payload = await uploaded.json() as { media: { id: string; fileName: string; storageKey: string } };
    const media = payload.media;
    expect(media.fileName).toBe("pixel.png");

    const duplicateForm = new FormData();
    duplicateForm.append("file", new File([pixelPng], "copy.png", { type: "image/png" }));
    expect((await upload(request("/api/library/upload", { method: "POST", body: duplicateForm }))).status).toBe(409);

    const preview = await contentGet(request(`/api/media/${media.id}/content`), { params: Promise.resolve({ id: media.id }) });
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await preview.arrayBuffer())).toEqual(pixelPng);

    const downloaded = await downloadPost(request(`/api/media/${media.id}/download`, { method: "POST" }), { params: Promise.resolve({ id: media.id }) });
    expect(downloaded.status).toBe(200);
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(pixelPng);
    const history = await historyGet(request("/api/history"));
    expect(await history.json()).toMatchObject({ total: 1, items: [{ mediaId: media.id, status: "completed", fileName: "pixel.png" }] });

    await getStorage().delete(media.storageKey);
    const missing = await downloadPost(request(`/api/media/${media.id}/download`, { method: "POST" }), { params: Promise.resolve({ id: media.id }) });
    expect(missing.status).toBe(404);
    const updatedHistory = await historyGet(request("/api/history"));
    const updatedHistoryPayload = await updatedHistory.json() as { total: number; items: Array<{ status: string }> };
    expect(updatedHistoryPayload.total).toBe(2);
    expect(updatedHistoryPayload.items.map((item) => item.status)).toContain("failed");

    const deleted = await mediaDelete(request(`/api/media/${media.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: media.id }) });
    expect(deleted.status).toBe(200);
    expect((await contentGet(request(`/api/media/${media.id}/content`), { params: Promise.resolve({ id: media.id }) })).status).toBe(404);
  });
});
