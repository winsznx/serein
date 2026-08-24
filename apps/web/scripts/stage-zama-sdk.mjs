/**
 * Copy the Zama SDK's browser bundle into `public/` so the app serves it from its own origin.
 *
 * Three reasons this is worth a build step rather than a bundler import:
 *
 * 1. The public CDN that older guides point at is dead — every version above 0.2.0 returns 403, and
 *    the one readable artifact is hard-wired to a relayer hostname that no longer resolves. Serving
 *    our own copy is the only way this keeps working.
 * 2. It keeps the Content-Security-Policy to `script-src 'self'`. No third-party script origin, no
 *    wildcard, nothing to trust but ourselves.
 * 3. The SDK's WASM loader resolves `new URL("/tfhe_bg.wasm", …)` — an absolute path from the
 *    origin root — so the binaries have to sit at the root regardless of where the script lives.
 *    Copying them explicitly makes that requirement visible instead of surprising.
 *
 * The files are gitignored: they are vendored artifacts of a pinned dependency, reproduced on every
 * build from the exact version in the lockfile.
 */

import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "../public");

const sdkRoot = dirname(require.resolve("@zama-fhe/relayer-sdk/package.json"));
const bundleDir = join(sdkRoot, "bundle");

/** Destination is relative to `public/`. The WASM and worker must land at the origin root. */
const ASSETS = [
  { from: "relayer-sdk-js.umd.cjs", to: "zama/relayer-sdk-js.umd.cjs" },
  { from: "tfhe_bg.wasm", to: "tfhe_bg.wasm" },
  { from: "kms_lib_bg.wasm", to: "kms_lib_bg.wasm" },
  { from: "workerHelpers.js", to: "workerHelpers.js" },
];

let total = 0;
for (const asset of ASSETS) {
  const source = join(bundleDir, asset.from);
  const target = join(publicDir, asset.to);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  const bytes = statSync(target).size;
  total += bytes;
  console.log(`  ${asset.to.padEnd(34)} ${(bytes / 1024).toFixed(0)} KB`);
}

const version = require("@zama-fhe/relayer-sdk/package.json").version;
console.log(`Staged Zama SDK ${version} (${(total / 1024 / 1024).toFixed(1)} MB) into public/`);
