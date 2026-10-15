import { cleanupExpiredMedia } from "../src/lib/services";

async function main() {
  try {
    const result = await cleanupExpiredMedia();
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } catch {
    process.stderr.write("Retention cleanup failed. Check database and object-storage health.\n");
    process.exitCode = 1;
  }
}

void main();
