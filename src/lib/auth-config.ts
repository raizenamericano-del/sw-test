import { constantTimeStringEqual } from "./security";

export function getAdminCredentials(): { username: string; password: string } | null {
  const username = process.env.ADMIN_USERNAME || (process.env.NODE_ENV === "production" ? "" : "admin");
  const password = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "imhub-demo-2026");
  if (!username || !password) return null;
  return { username, password };
}

export function credentialsMatch(inputUsername: string, inputPassword: string, expectedUsername: string, expectedPassword: string): boolean {
  return constantTimeStringEqual(inputUsername, expectedUsername) && constantTimeStringEqual(inputPassword, expectedPassword);
}
