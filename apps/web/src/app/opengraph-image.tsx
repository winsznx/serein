import { ImageResponse } from "next/og";

/**
 * The site-wide Open Graph / Twitter card image.
 *
 * OpenNext's Cloudflare adapter has first-class support for `next/og`: it detects the traced
 * `@vercel/og` usage at build time, copies the edge-compatible bundle (Yoga's WASM layout engine
 * included) into the Worker, and patches its font-fetch call sites into static imports so nothing
 * tries to `fetch()` a font from within the Worker at request time.
 *
 * No custom font here on purpose. The Satori build bundled with this Next version only accepts
 * TTF/OTF/WOFF — the vendored Inter files are WOFF2, for the browser, and handing them to
 * `ImageResponse` fails the build outright ("Unsupported OpenType signature wOF2"). Rather than
 * vendor a second copy of Inter in a different format for one image, this leans on the library's
 * own bundled fallback font — exactly the path OpenNext's patch above exists to support.
 *
 * Declared once at the root so every route that doesn't set its own `openGraph.images` inherits it
 * (wired in `layout.tsx`'s metadata) — one link preview, everywhere, instead of a blank card on
 * every page but the home one.
 */
export const alt = "Serein — Private savings. Fair prizes.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        backgroundColor: "#221d1d",
        backgroundImage:
          "radial-gradient(760px 480px at 82% 8%, rgba(153,142,255,0.22), transparent 60%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            display: "flex",
            width: 44,
            height: 44,
            borderRadius: 9999,
            border: "2px solid #998eff",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 10,
              height: 10,
              borderRadius: 9999,
              backgroundColor: "#998eff",
            }}
          />
        </div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: "#ffffff" }}>
          Serein
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 920 }}>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: "#ffffff",
          }}
        >
          Private savings. Fair prizes.
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.65)" }}>
          Encrypted balances, exact weighted draws, no path from prizes to your principal.
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            display: "flex",
            padding: "8px 16px",
            borderRadius: 9999,
            backgroundColor: "rgba(153,142,255,0.15)",
            color: "#998eff",
            fontSize: 20,
          }}
        >
          Sepolia testnet · Zama Protocol
        </div>
      </div>
    </div>,
    size,
  );
}
