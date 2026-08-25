/**
 * Stub for the optional `@x402/*` modules.
 *
 * `@coinbase/cdp-sdk`, reached through RainbowKit's Coinbase wallet, imports these to support x402
 * micropayments. Serein does not use that feature, and the packages total roughly 8 MB unpacked, so
 * shipping them to every visitor to satisfy an import that is never executed would be pure weight.
 *
 * The alias in `next.config.ts` points those specifiers here. If a code path ever does reach one of
 * these, it throws with an explanation rather than failing as an undefined property somewhere
 * unrelated — an absent optional dependency should say so.
 */
function unavailable(): never {
  throw new Error(
    "x402 payments are not enabled in Serein. This module is stubbed in next.config.ts because " +
      "the protocol does not use micropayments. If a wallet flow genuinely needs it, install " +
      "@x402/core and @x402/evm and remove the resolve alias.",
  );
}

export default new Proxy({} as Record<string, unknown>, {
  get: () => unavailable,
});
