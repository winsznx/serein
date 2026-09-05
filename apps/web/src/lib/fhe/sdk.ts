"use client";

import { CHAIN_ID, rpcUrl } from "@/lib/chain";

/**
 * Loading and holding the Zama SDK instance.
 *
 * The SDK is ~6 MB of WebAssembly. Pulling that onto the landing page would be indefensible for a
 * visitor who is only reading, so nothing here is imported statically: the script tag is appended
 * the first time a screen actually needs to encrypt or decrypt something, and the marketing pages
 * never call it.
 *
 * It is served from the app's own origin. The public CDN that older guides point at returns 403 for
 * every current version, and the one readable artifact left there is compiled against a relayer
 * hostname that no longer resolves — so vendoring is both the working option and the one that keeps
 * the CSP to `script-src 'self'`.
 */

/** The shape of the SDK we use. Narrower than the package's, so drift shows up as a type error. */
export interface EncryptedInput {
  add64(value: bigint): EncryptedInput;
  encrypt(): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }>;
}

export interface FhevmInstance {
  createEncryptedInput(contractAddress: string, userAddress: string): EncryptedInput;
  generateKeypair(): { publicKey: string; privateKey: string };
  createEIP712(
    publicKey: string,
    contractAddresses: string[],
    startTimestamp: number,
    durationDays: number,
  ): {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    message: Record<string, unknown>;
    primaryType: string;
  };
  userDecrypt(
    handles: { handle: string; contractAddress: string }[],
    privateKey: string,
    publicKey: string,
    signature: string,
    contractAddresses: string[],
    userAddress: string,
    startTimestamp: number,
    durationDays: number,
  ): Promise<Record<string, bigint | boolean | string>>;
  publicDecrypt(handles: string[]): Promise<{
    clearValues: Record<string, bigint | boolean | string>;
    abiEncodedClearValues: `0x${string}`;
    decryptionProof: `0x${string}`;
  }>;
}

interface RelayerSdkGlobal {
  initSDK(options?: { thread?: number }): Promise<boolean>;
  createInstance(config: Record<string, unknown>): Promise<FhevmInstance>;
  SepoliaConfig: Record<string, unknown>;
}

declare global {
  interface Window {
    relayerSDK?: RelayerSdkGlobal;
  }
}

/**
 * The injected provider, but only when it is actually pointed at Sepolia.
 *
 * A wallet's global network switcher and the chain it has permitted this site to use are not the
 * same thing in current MetaMask: a visitor can be correctly connected to Serein on Sepolia while
 * their wallet's own UI sits on a different chain, and `eth_chainId` against the raw injected
 * provider follows that global switcher, not the per-site permission. Handing that provider straight
 * to the relayer SDK then means asking a real wallet for a network it is not actually looking at —
 * there is no FHE coprocessor on whatever chain the switcher happens to show, `createInstance` fails,
 * and the failure surfaces as "could not reach the relayer" for a visitor whose connection to this
 * app was never at fault. Checked once here and discarded otherwise, in favour of the app's own
 * chain-pinned read proxy below.
 */
async function injectedProvider(): Promise<unknown> {
  const ethereum = (
    window as unknown as { ethereum?: { request: (args: { method: string }) => Promise<unknown> } }
  ).ethereum;
  if (!ethereum) return undefined;
  try {
    const chainIdHex = await ethereum.request({ method: "eth_chainId" });
    return chainIdHex === `0x${CHAIN_ID.toString(16)}` ? ethereum : undefined;
  } catch {
    return undefined;
  }
}

const SDK_SCRIPT_SRC = "/zama/relayer-sdk-js.umd.cjs";

export class FheUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FheUnavailableError";
  }
}

let scriptPromise: Promise<RelayerSdkGlobal> | null = null;
let instancePromise: Promise<FhevmInstance> | null = null;

function loadScript(): Promise<RelayerSdkGlobal> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<RelayerSdkGlobal>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new FheUnavailableError("The encryption library only runs in a browser."));
      return;
    }
    if (window.relayerSDK) {
      resolve(window.relayerSDK);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");

    const onLoad = (): void => {
      if (window.relayerSDK) resolve(window.relayerSDK);
      else
        reject(
          new FheUnavailableError(
            "The encryption library loaded but did not register itself. Try a hard refresh.",
          ),
        );
    };
    const onError = (): void => {
      scriptPromise = null;
      reject(
        new FheUnavailableError(
          "Could not load the encryption library. Check your connection and try again.",
        ),
      );
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existing) {
      script.src = SDK_SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return scriptPromise;
}

/**
 * Get the shared SDK instance, loading and initialising it on first use.
 *
 * Deliberately a singleton. Re-initialising means recompiling the WASM and re-fetching key material
 * from the relayer, which is slow enough that a saver would feel it on every action.
 */
export async function getFheInstance(): Promise<FhevmInstance> {
  if (instancePromise) return instancePromise;

  instancePromise = (async () => {
    const sdk = await loadScript();

    try {
      // Single-threaded on purpose. Multi-threaded WASM needs cross-origin isolation, and
      // `Cross-Origin-Embedder-Policy: require-corp` breaks wallet connectors for a speedup that
      // does not matter when the workload is one 64-bit value.
      await sdk.initSDK({ thread: 1 });
    } catch (error) {
      instancePromise = null;
      // The message below is a guess at the cause for whoever hits it; the console line is not —
      // this is the one place a WASM failure that never reaches a support conversation still leaves
      // a trace, since `FheUnavailableError` intentionally shows a saver a short, calm sentence
      // instead of a stack trace, and the real `cause` would otherwise go completely unseen.
      console.error("[serein] Zama SDK WASM init failed:", error);
      throw new FheUnavailableError(
        "The encryption library failed to start. This can happen if your browser blocks WebAssembly.",
        { cause: error },
      );
    }

    try {
      // Prefer the wallet's own provider so the SDK reads the same chain the user is signing
      // against, but only when it is genuinely on Sepolia right now; otherwise the app's own
      // chain-pinned read proxy, so a disconnected visitor — or one whose wallet UI has wandered to
      // another chain while still permitting this site on Sepolia — gets a usable instance either way.
      const network = (await injectedProvider()) ?? rpcUrl();
      return await sdk.createInstance({ ...sdk.SepoliaConfig, chainId: CHAIN_ID, network });
    } catch (error) {
      instancePromise = null;
      // Same reasoning as above. This step fetches the FHE public key and CRS from the relayer and
      // its S3 key store — a network failure here can come from the relayer itself, from a
      // restrictive in-app browser (a social app's embedded browser is a common source of this,
      // since it applies its own network policy on top of the page's), or from an actual outage.
      // Nothing about the visible symptom tells them apart; the console line is where that starts.
      console.error("[serein] Zama SDK createInstance failed:", error);
      throw new FheUnavailableError(
        "Could not reach the Zama relayer. It may be rate-limiting or temporarily unavailable, or " +
          "this browser may be restricting the connection — if you're inside another app's built-in " +
          "browser, try opening this page in Safari or Chrome directly. Your savings are unaffected, " +
          "and you can retry in a moment.",
        { cause: error },
      );
    }
  })();

  return instancePromise;
}

/** Drop the cached instance, e.g. after a chain switch. */
export function resetFheInstance(): void {
  instancePromise = null;
}

export function toHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
