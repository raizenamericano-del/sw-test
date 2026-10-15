import type { AppDatabase } from "../types";
import { JsonDatabase } from "./json-database";

const globalForDatabase = globalThis as unknown as { imhDatabase?: Promise<AppDatabase> };

export const ADMIN_USER_ID = "admin";

export async function getDatabase(): Promise<AppDatabase> {
  if (globalForDatabase.imhDatabase) return globalForDatabase.imhDatabase;
  if (process.env.DATABASE_URL) {
    globalForDatabase.imhDatabase = import("./prisma-database").then(({ PrismaDatabase }) => new PrismaDatabase());
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL_REQUIRED");
  } else {
    globalForDatabase.imhDatabase = Promise.resolve(new JsonDatabase());
  }
  return globalForDatabase.imhDatabase;
}

export async function ensureAdminDatabase(): Promise<AppDatabase> {
  const database = await getDatabase();
  const username = process.env.ADMIN_USERNAME || (process.env.NODE_ENV === "production" ? "" : "admin");
  if (!username) throw new Error("ADMIN_USERNAME_REQUIRED");
  await database.ensureAdmin(username);
  return database;
}

export function resetDatabaseForTests(): void {
  globalForDatabase.imhDatabase = undefined;
}
