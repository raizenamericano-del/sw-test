import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import type { MediaType } from "./types";

export const SESSION_COOKIE = "imh_admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function signature(message: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(message).digest();
}

export function createSessionToken(username: string, secret: string, nowMs = Date.now()): string {
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("SESSION_SECRET must be at least 32 bytes.");
  const now = Math.floor(nowMs / 1000);
  const payload: SessionPayload = { sub: username, iat: now, exp: now + SESSION_TTL_SECONDS };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${signature(encoded, secret).toString("base64url")}`;
}

export function verifySessionToken(token: string | null | undefined, secret: string, nowMs = Date.now()): SessionPayload | null {
  if (!token || !secret || Buffer.byteLength(secret) < 32) return null;
  const [encoded, signaturePart, extra] = token.split(".");
  if (!encoded || !signaturePart || extra !== undefined) return null;
  let received: Buffer;
  let payload: SessionPayload;
  try {
    received = Buffer.from(signaturePart, "base64url");
    const expected = signature(encoded, secret);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  const now = Math.floor(nowMs / 1000);
  if (typeof payload.sub !== "string" || !payload.sub || !Number.isFinite(payload.exp) || !Number.isFinite(payload.iat)) return null;
  if (payload.exp <= now || payload.iat > now + 60 || payload.exp - payload.iat > SESSION_TTL_SECONDS) return null;
  return payload;
}

export function safeFilename(input: string, mimeType: string): string {
  const basename = path.posix.basename(String(input || "media").replaceAll("\\", "/"));
  const noControls = [...basename.normalize("NFKC")].filter((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join("");
  const withoutExtension = noControls.replace(/\.[a-zA-Z0-9]{1,8}$/u, "");
  const cleanBase = withoutExtension
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/[^\p{L}\p{N}._ -]/gu, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 88);
  const extensions: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
  };
  const extension = extensions[mimeType] ?? ".bin";
  return `${cleanBase || "media"}${extension}`;
}

export function detectMediaType(bytes: Uint8Array): { mimeType: string; mediaType: MediaType; extension: string } | null {
  const b = Buffer.from(bytes);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mimeType: "image/jpeg", mediaType: "image", extension: ".jpg" };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mimeType: "image/png", mediaType: "image", extension: ".png" };
  if (b.length >= 6 && (b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a")) return { mimeType: "image/gif", mediaType: "image", extension: ".gif" };
  if (b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return { mimeType: "image/webp", mediaType: "image", extension: ".webp" };
  if (b.length >= 12 && b.subarray(4, 8).toString("ascii") === "ftyp") return { mimeType: "video/mp4", mediaType: "video", extension: ".mp4" };
  if (b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { mimeType: "video/webm", mediaType: "video", extension: ".webm" };
  return null;
}

export function validateMediaBytes(bytes: Uint8Array, declaredMimeType: string): { mimeType: string; mediaType: MediaType; extension: string } | null {
  const detected = detectMediaType(bytes);
  if (!detected) return null;
  const normalizedDeclared = declaredMimeType.toLowerCase().split(";")[0].trim();
  if (normalizedDeclared && normalizedDeclared !== "application/octet-stream" && normalizedDeclared !== detected.mimeType) return null;
  return detected;
}

const SAFE_EXTENSIONS = new Set([".jpg", ".png", ".webp", ".gif", ".mp4", ".webm"]);

export function assertSafeStorageKey(key: string): string {
  if (!key || key.length > 240 || key.includes("\\") || key.startsWith("/") || key.includes("..")) {
    throw new Error("Unsafe storage key");
  }
  const parts = key.split("/");
  if (parts.length !== 3 || parts[0] !== "media" || !/^[a-zA-Z0-9_-]{1,80}$/.test(parts[1])) throw new Error("Unsafe storage key");
  const filename = parts[2];
  const dot = filename.lastIndexOf(".");
  if (dot < 1 || !/^[a-zA-Z0-9-]{1,100}$/.test(filename.slice(0, dot)) || !SAFE_EXTENSIONS.has(filename.slice(dot).toLowerCase())) {
    throw new Error("Unsafe storage key");
  }
  return parts.join("/");
}

function isPrivateIPv4(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((part) => part > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export function validateOutboundUrl(raw: string, allowedHosts: string[]): URL {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const allowed = allowedHosts.map((value) => value.toLowerCase().replace(/\.$/, ""));
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") throw new Error("Outbound URL is not allowed");
  if (!allowed.includes(host) || host === "localhost" || !host.includes(".") || isPrivateIPv4(host) || host === "::1" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Outbound host is not allow-listed");
  }
  return url;
}

export function constantTimeStringEqual(left: string, right: string): boolean {
  const leftDigest = createHmac("sha256", "imh-compare").update(left).digest();
  const rightDigest = createHmac("sha256", "imh-compare").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}
