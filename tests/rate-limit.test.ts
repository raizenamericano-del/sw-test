import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimitsForTests } from "../src/lib/rate-limit";
import { acquireDownloadLock, releaseDownloadLock, resetDownloadLocksForTests } from "../src/lib/download-lock";

beforeEach(() => { resetRateLimitsForTests(); resetDownloadLocksForTests(); });

describe("rate limiting and duplicate-download guard", () => {
  it("allows a fixed budget then rejects until the window expires", () => {
    expect(checkRateLimit("admin-login", 2, 1000, 100).allowed).toBe(true);
    expect(checkRateLimit("admin-login", 2, 1000, 101).allowed).toBe(true);
    const limited = checkRateLimit("admin-login", 2, 1000, 102);
    expect(limited.allowed).toBe(false);
    expect(limited.retryAfterSeconds).toBe(1);
    expect(checkRateLimit("admin-login", 2, 1000, 1200).allowed).toBe(true);
  });
  it("locks one media download while allowing unrelated files", () => {
    expect(acquireDownloadLock("admin:one")).toBe(true);
    expect(acquireDownloadLock("admin:one")).toBe(false);
    expect(acquireDownloadLock("admin:two")).toBe(true);
    releaseDownloadLock("admin:one");
    expect(acquireDownloadLock("admin:one")).toBe(true);
  });
});
