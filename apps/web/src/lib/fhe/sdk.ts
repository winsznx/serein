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

/** wagmi already declares `window.ethereum`; read it without redeclaring the global. */
function injectedProvider(): unknown {
  return (window as unknown as { ethereum?: unknown }).ethereum;
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
      throw new FheUnavailableError(
        "The encryption library failed to start. This can happen if your browser blocks WebAssembly.",
        { cause: error },
      );
    }

    try {
      // Prefer the wallet's own provider so the SDK reads the same chain the user is signing
      // against; fall back to the app's read proxy so a disconnected visitor still gets a usable
      // instance.
      const network = injectedProvider() ?? rpcUrl();
      return await sdk.createInstance({ ...sdk.SepoliaConfig, chainId: CHAIN_ID, network });
    } catch (error) {
      instancePromise = null;
      throw new FheUnavailableError(
        "Could not reach the Zama relayer. It may be rate-limiting or temporarily unavailable — " +
          "your savings are unaffected, and you can retry in a moment.",
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
