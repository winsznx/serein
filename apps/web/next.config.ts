import type { NextConfig } from "next";

/**
 * Content-Security-Policy, derived from what the app actually loads rather than from a template.
 *
 * The two entries that need explaining:
 *
 * `'wasm-unsafe-eval'` — the Zama SDK compiles WebAssembly, and CSP treats `WebAssembly.instantiate`
 * as a form of eval. This is the narrow directive that permits exactly that and nothing else; the
 * broad `'unsafe-eval'` is not needed and is not granted.
 *
 * `worker-src 'self' blob:` — the SDK's thread-pool loader falls back to constructing a worker from
 * a blob when it cannot resolve the module URL. The app runs single-threaded by choice (see below),
 * so this path is rarely taken, but omitting it turns a graceful fallback into a hard failure.
 *
 * Script origins are same-origin only. The SDK bundle is vendored into `public/` at build time
 * rather than pulled from a CDN, so there is no third-party script origin to trust — which is just
 * as well, because the CDN older guides point at is dead.
 *
 * Cross-origin isolation (COOP/COEP) is deliberately NOT set. It would let the SDK use multiple
 * WASM threads, but `require-corp` also breaks every cross-origin resource that does not opt in,
 * wallet connectors included. Encrypting one 64-bit value is fast enough single-threaded that the
 * trade is not close.
 */

const RELAYER_ORIGIN = "https://relayer.testnet.zama.org";

// WalletConnect reaches several of its own hosts. They are listed only when a project id is
// configured, so a deployment without WalletConnect ships a tighter policy.
const WALLETCONNECT_ORIGINS = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
  ? [
      "https://*.walletconnect.com",
      "https://*.walletconnect.org",
      "wss://*.walletconnect.com",
      "wss://*.walletconnect.org",
    ]
  : [];

const CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'wasm-unsafe-eval'"],
  // Next.js inlines critical CSS and streams style tags during hydration.
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'", RELAYER_ORIGIN, ...WALLETCONNECT_ORIGINS],
  "worker-src": ["'self'", "blob:"],
  "frame-src": ["'self'"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "object-src": ["'none'"],
  "manifest-src": ["'self'"],
};

const csp = Object.entries(CSP_DIRECTIVES)
  .map(([directive, values]) => `${directive} ${values.join(" ")}`)
  .join("; ");

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
          { key: "Content-Security-Policy", value: csp },
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
