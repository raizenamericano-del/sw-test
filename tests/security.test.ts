import { describe, expect, it } from "vitest";
import {
  assertSafeStorageKey,
  createSessionToken,
  safeFilename,
  validateMediaBytes,
  validateOutboundUrl,
  verifySessionToken,
} from "../src/lib/security";

const secret = "a-test-session-secret-with-at-least-32-bytes";
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const mp4 = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);

describe("admin session tokens", () => {
  it("signs and verifies a session before expiry", () => {
    const token = createSessionToken("admin", secret, 1_000_000);
    expect(verifySessionToken(token, secret, 1_000_001)?.sub).toBe("admin");
  });
  it("rejects tampered, expired, and incorrectly signed cookies", () => {
    const token = createSessionToken("admin", secret, 1_000_000);
    expect(verifySessionToken(`${token}x`, secret, 1_000_001)).toBeNull();
    expect(verifySessionToken(token, "another-test-session-secret-32-bytes", 1_000_001)).toBeNull();
    expect(verifySessionToken(token, secret, 1_000_000 + 13 * 60 * 60 * 1000)).toBeNull();
  });
  it("requires a sufficiently strong signing secret", () => {
    expect(() => createSessionToken("admin", "short", 1_000)).toThrow(/32 bytes/);
  });
});

describe("media validation", () => {
  it("recognizes image and video signatures rather than trusting filenames", () => {
    expect(validateMediaBytes(png, "image/png")).toMatchObject({ mimeType: "image/png", mediaType: "image", extension: ".png" });
    expect(validateMediaBytes(mp4, "video/mp4")).toMatchObject({ mimeType: "video/mp4", mediaType: "video", extension: ".mp4" });
    expect(validateMediaBytes(png, "video/mp4")).toBeNull();
  });
  it("rejects unknown or mismatched content", () => {
    expect(validateMediaBytes(Buffer.from("not an image"), "image/png")).toBeNull();
    expect(validateMediaBytes(png, "application/pdf")).toBeNull();
  });
  it("sanitizes filenames and forces a MIME-derived extension", () => {
    expect(safeFilename("../../hello\\world.png", "image/jpeg")).toBe("world.jpg");
    expect(safeFilename("..\\..\\\u0000", "image/png")).toBe("media.png");
    expect(safeFilename("foto <script>.jpg", "image/jpeg")).not.toContain("<script>");
  });
  it("rejects unsafe object keys and traversal", () => {
    expect(assertSafeStorageKey("media/admin/5d9b77d0-2ad1-42b0-9d42-f2a13d4b89e6.jpg")).toContain("media/admin/");
    expect(() => assertSafeStorageKey("../../etc/passwd")).toThrow(/Unsafe/);
    expect(() => assertSafeStorageKey("media/admin/file.exe")).toThrow(/Unsafe/);
  });
});

describe("SSRF guard", () => {
  const allowlist = ["graph.facebook.com"];
  it("permits only HTTPS on an exact configured host", () => {
    expect(validateOutboundUrl("https://graph.facebook.com/v26.0/me", allowlist).hostname).toBe("graph.facebook.com");
    expect(() => validateOutboundUrl("http://graph.facebook.com/me", allowlist)).toThrow();
    expect(() => validateOutboundUrl("https://evil.example/me", allowlist)).toThrow();
  });
  it("rejects local, private, credentialed, and metadata-style URLs", () => {
    expect(() => validateOutboundUrl("https://127.0.0.1/admin", ["127.0.0.1"])).toThrow();
    expect(() => validateOutboundUrl("https://localhost/", ["localhost"])).toThrow();
    expect(() => validateOutboundUrl("https://user:pass@graph.facebook.com/", allowlist)).toThrow();
    expect(() => validateOutboundUrl("https://metadata.google.internal/", ["metadata.google.internal"])).toThrow();
  });
});
