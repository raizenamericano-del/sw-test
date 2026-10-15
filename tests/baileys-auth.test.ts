import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initAuthCreds } from "@whiskeysockets/baileys";
import { createEncryptedAuthState, decryptAuthState, encryptAuthState } from "../src/lib/baileys-auth";
import { JsonDatabase } from "../src/lib/db/json-database";

let tempDir = "";
const key = Buffer.alloc(32, 0x41).toString("hex");

afterEach(async () => {
  vi.unstubAllEnvs();
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = "";
});

describe("encrypted Baileys auth storage", () => {
  it("encrypts binary auth state and rejects a wrong key or tampered envelope", () => {
    const state = { creds: initAuthCreds(), keys: { session: { example: Buffer.from("private-signal-key") } } };
    const encrypted = encryptAuthState(state, Buffer.from(key, "hex"));
    expect(encrypted).toMatch(/^imh-auth-v1\./);
    expect(encrypted).not.toContain("private-signal-key");
    expect(Buffer.from(decryptAuthState(encrypted, Buffer.from(key, "hex")).keys.session.example as Uint8Array)).toEqual(Buffer.from("private-signal-key"));
    expect(() => decryptAuthState(encrypted, Buffer.alloc(32, 0x42))).toThrow(/WHATSAPP_AUTH_ENCRYPTION_KEY/i);
    expect(() => decryptAuthState(`${encrypted}x`, Buffer.from(key, "hex"))).toThrow(/could not be decrypted/i);
  });

  it("persists and restores keys only as authenticated ciphertext", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "imh-auth-test-"));
    const db = new JsonDatabase(tempDir);
    await db.ensureAdmin("admin");
    vi.stubEnv("WHATSAPP_AUTH_ENCRYPTION_KEY", key);
    const state = await createEncryptedAuthState(db, "admin");
    await state.state.keys.set({ session: { "peer.1": Buffer.from("encrypted-only") } });
    const ciphertext = await db.getAuthState("admin");
    expect(ciphertext).toMatch(/^imh-auth-v1\./);
    expect(ciphertext).not.toContain("encrypted-only");

    const restored = await createEncryptedAuthState(db, "admin");
    const values = await restored.state.keys.get("session", ["peer.1"]);
    expect(Buffer.from(values["peer.1"])).toEqual(Buffer.from("encrypted-only"));
    await restored.disableAndClear();
    expect(await db.getAuthState("admin")).toBeNull();
  });

  it("requires a correctly-sized encryption key before creating a session store", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "imh-auth-test-"));
    const db = new JsonDatabase(tempDir);
    await db.ensureAdmin("admin");
    vi.stubEnv("WHATSAPP_AUTH_ENCRYPTION_KEY", "short");
    await expect(createEncryptedAuthState(db, "admin")).rejects.toThrow(/missing or invalid/i);
  });
});
