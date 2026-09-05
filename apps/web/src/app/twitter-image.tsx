/**
 * X/Twitter cards fall back to `og:image` when no `twitter:image` is set, but Twitter's own crawler
 * is inconsistent about that fallback in practice — this file exists so the card renders reliably
 * without maintaining a second copy of the image.
 */
export { alt, contentType, size } from "./opengraph-image";
export { default } from "./opengraph-image";
