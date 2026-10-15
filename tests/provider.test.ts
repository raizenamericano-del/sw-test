import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonDatabase } from "../src/lib/db/json-database";
import { BaileysProvider } from "../src/lib/baileys-provider";

describe("Baileys provider capability contract", () => {
  it("never trusts a stale database flag as proof of a live socket", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "imh-provider-test-"));
    try {
      const db = new JsonDatabase(directory);
      await db.ensureAdmin("admin");
      await db.setSession("admin", { state: "connected", connectedAt: new Date().toISOString() });
      const result = await new BaileysProvider().getSession("admin", db);
      expect(result.state).toBe("disconnected");
      expect(result.lastErrorCode).toBe("credentials_missing");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("clearly marks the linked-device provider as unofficial and Status as experimental", () => {
    const provider = new BaileysProvider();
    const result = provider.status();
    expect(result.provider).toBe("baileys");
    expect(result.supported).toBe(true);
    expect(result.connected).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.capabilities.accountPairing).toBe(true);
    expect(result.capabilities.receivesStatuses).toBe(true);
    expect(result.capabilities.downloadsStatusMedia).toBe(true);
    expect(result.capabilities.persistentSessions).toBe(true);
    expect(result.capabilities.statusFeedExperimental).toBe(true);
    expect(result.capabilities.official).toBe(false);
    expect(result.message).toMatch(/eksperimental/i);
    expect(result.message).toMatch(/tidak resmi/i);
  });
});
