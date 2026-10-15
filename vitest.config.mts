import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
  },
  resolve: {
    alias: { "@": path.resolve(configDirectory, "src") },
  },
});
