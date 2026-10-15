import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast-provider";

export const metadata: Metadata = {
  title: "IM Status Hub — Admin workspace",
  description: "Admin-only hub untuk status integrasi WhatsApp dan media milik Anda.",
  applicationName: "IM Status Hub",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "IM Status Hub" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#10251b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
