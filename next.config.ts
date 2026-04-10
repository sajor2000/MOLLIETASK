import type { NextConfig } from "next";

// 'unsafe-inline' is required for script-src and style-src because Next.js App
// Router injects inline scripts for hydration and page transitions. The proper
// upgrade path is CSP nonces via middleware (next-safe), but that adds complexity
// with no current XSS vector (all dynamic content is rendered via React/Convex
// which auto-escapes output). Revisit when Next.js nonce support matures.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com;
  style-src 'self' 'unsafe-inline';
  font-src 'self' https://fonts.gstatic.com;
  worker-src 'self' blob:;
  connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.clerk.accounts.dev https://clerk.shorelinetask.space https://*.clerk.com https://clerk-telemetry.com;
  frame-src 'self' https://*.clerk.accounts.dev https://clerk.shorelinetask.space https://*.clerk.com;
  img-src 'self' blob: data: https://img.clerk.com https://www.gravatar.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\n/g, "");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: cspHeader },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
