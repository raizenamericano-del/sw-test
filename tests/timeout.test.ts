import { describe, expect, it } from "vitest";
import { TimeoutError, withTimeout } from "../src/lib/timeout";

describe("timeout boundary", () => {
  it("returns a result before the deadline", async () => {
    await expect(withTimeout(Promise.resolve("ready"), 50)).resolves.toBe("ready");
  });
  it("rejects a stalled provider operation without leaking implementation details", async () => {
    await expect(withTimeout(new Promise<string>(() => undefined), 5, "provider timeout")).rejects.toBeInstanceOf(TimeoutError);
  });
});
