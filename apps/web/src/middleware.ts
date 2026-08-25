import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy, issued per request with a fresh nonce.
 *
 * This has to be middleware rather than a static header. Next.js streams the RSC payload through
 * inline `<script>` tags, so a policy of `script-src 'self'` with no nonce blocks its own hydration:
 * React never mounts, every client component stays on its server-rendered fallback, and no chain read
 * ever fires. The page looks fine — it is just permanently inert. That failure is silent unless
 * something actually drives a browser, which is why the E2E suite does.
 *
 * The alternative, `'unsafe-inline'`, would work and would also permit any injected inline script.
 * A nonce is the version that still means something.
 *
 * `'strict-dynamic'` is what makes the Zama SDK loadable. The SDK is injected at runtime by creating
 * a `<script src="/zama/…">` element, and under `strict-dynamic` a script loaded by an
 * already-trusted script inherits that trust — so the SDK works without adding a blanket origin
 * allowance. Browsers that honour `strict-dynamic` ignore `'self'`; older ones fall back to it.
 *
 * `'wasm-unsafe-eval'` is the narrow directive permitting `WebAssembly.instantiate`. The broad
 * `'unsafe-eval'` is neither needed nor granted.
 *
 * Cost: a nonce makes every response dynamic, so pages are no longer statically optimised. Acceptable
 * here — the app reads live chain state on every screen anyway.
 */

const RELAYER_ORIGIN = "https://relayer.testnet.zama.org";

// The relayer serves key material from S3; the SDK fetches the public key and the 4.4 MB CRS from
// whatever host `/v2/keyurl` names, so that origin has to be reachable too.
const RELAYER_KEY_STORE = "https://zama-mpc-testnet-public-efd88e2b.s3.eu-west-1.amazonaws.com";

const WALLETCONNECT_ORIGINS = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
  ? [
      "https://*.walletconnect.com",
      "https://*.walletconnect.org",
      "wss://*.walletconnect.com",
      "wss://*.walletconnect.org",
    ]
  : [];

function buildCsp(nonce: string): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "'wasm-unsafe-eval'",
      // Ignored by browsers that honour strict-dynamic; a safety net for those that do not.
      "https:",
    ],
    // Next.js injects critical CSS inline during streaming. Style injection is a far smaller risk
    // than script injection, and there is no nonce path for it that survives streaming.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", RELAYER_ORIGIN, RELAYER_KEY_STORE, ...WALLETCONNECT_ORIGINS],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
    "manifest-src": ["'self'"],
    "upgrade-insecure-requests": [],
  };

  return Object.entries(directives)
    .map(([directive, values]) =>
      values.length > 0 ? `${directive} ${values.join(" ")}` : directive,
    )
    .join("; ");
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = buildCsp(nonce);

  // Next reads `x-nonce` to stamp its own script tags.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets. The WASM binaries and the vendored SDK are large and
     * immutable; running middleware on them would add latency and a needless nonce to a file that
     * has no scripts in it.
     */
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|tfhe_bg.wasm|kms_lib_bg.wasm|workerHelpers.js|zama/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
