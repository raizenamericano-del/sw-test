import { getDatabase } from "./db";
import { getStorage } from "./storage";
import { getProvider } from "./provider";

export async function collectHealth() {
  let database: { status: "healthy" | "degraded"; mode: string; detail: string };
  try {
    const db = await getDatabase();
    const result = await db.health();
    database = { ...result, mode: db.mode };
  } catch (error) {
    database = {
      status: "degraded",
      mode: "unconfigured",
      detail: error instanceof Error && error.message === "DATABASE_URL_REQUIRED" ? "DATABASE_URL is required in production." : "Database health check failed.",
    };
  }
  const storageAdapter = getStorage();
  const storageResult = await storageAdapter.health();
  const provider = getProvider();
  const healthy = database.status === "healthy" && storageResult.status === "healthy";
  return {
    status: healthy ? "healthy" as const : "degraded" as const,
    timestamp: new Date().toISOString(),
    database,
    storage: { ...storageResult, driver: storageAdapter.driver, persistent: storageAdapter.persistent },
    whatsapp: {
      provider: provider.id,
      statusAccess: provider.capabilities.statusFeedExperimental ? "experimental-unverified" : provider.capabilities.receivesStatuses ? "supported" : "unsupported",
      connection: "not-inspected" as const,
    },
  };
}
