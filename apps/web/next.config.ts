import type { NextConfig } from "next";

/**
 * Security headers that do not vary per request.
 *
 * The Content-Security-Policy is NOT here — it needs a per-request nonce so Next.js's own inline
 * hydration scripts are allowed, and a static header cannot carry one. It lives in
 * `src/middleware.ts`. Shipping it here as `script-src 'self'` looked strict and silently prevented
 * React from ever hydrating.
 */

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@serein/protocol-sdk"],
  typescript: {
    // A type error is a build failure. Shipping around one would put a lie in production.
    ignoreBuildErrors: false,
  },
  // Linting runs as its own step in `pnpm check` rather than inside the build.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // The WASM binaries are content-addressed by the pinned SDK version and never change.
        source: "/:file(tfhe_bg.wasm|kms_lib_bg.wasm|workerHelpers.js)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
