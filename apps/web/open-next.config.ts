import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Serein reads all of its product state from Sepolia at request time, so there is nothing to
 * incrementally cache. Leaving the cache overrides off keeps the deployment to a single Worker with
 * no KV or D1 binding to provision, and removes a whole class of "the page is showing yesterday's
 * draw" bugs that a stale cache would introduce.
 */
export default defineCloudflareConfig();
