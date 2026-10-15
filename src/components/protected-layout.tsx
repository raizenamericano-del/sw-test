"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "./app-shell";

export function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unauthorized");
        return response.json() as Promise<{ user?: { username?: string } }>;
      })
      .then((result) => {
        if (!cancelled) setUsername(result.user?.username || "admin");
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [router]);

  if (loading || !username) {
    return <div className="loading-screen"><div className="loading-card"><span className="spinner" />Memeriksa sesi admin…</div></div>;
  }
  return <AppShell username={username}>{children}</AppShell>;
}
