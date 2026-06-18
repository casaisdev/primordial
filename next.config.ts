import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy tuned for this app:
// - All pages are statically prerendered, so we avoid nonces (which would force
//   dynamic rendering) and keep the CDN-cacheable static output.
// - The simulation runs in a Web Worker bundled as a same-origin chunk, hence
//   `worker-src 'self' blob:`; the worker paints an OffscreenCanvas (no network).
// - `style-src 'unsafe-inline'` is required because Next inlines critical CSS and
//   Tailwind injects styles; there is no inline style nonce in static output.
// - Dev-only: React Fast Refresh needs `'unsafe-eval'` and the HMR socket needs ws:.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' blob: data:`,
  `font-src 'self'`,
  `worker-src 'self' blob:`,
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Only sent over HTTPS; harmless on http (dev). 2 years, includes subdomains.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
