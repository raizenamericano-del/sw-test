import type { NextConfig } from "next";

const production = process.env.NODE_ENV === "production";
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ...(production ? [{ key: "X-Frame-Options", value: "DENY" }] : []),
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
      "connect-src 'self' ws: wss:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      ...(production ? ["frame-ancestors 'none'"] : []),
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "@aws-sdk/client-s3", "@whiskeysockets/baileys", "pino"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
