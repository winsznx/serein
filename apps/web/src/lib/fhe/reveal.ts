"use client";

import { getFheInstance, type FhevmInstance } from "./sdk";

/**
 * Revealing a private value to its owner.
 *
 * The flow is: generate a throwaway keypair in the browser, have the wallet sign an EIP-712
 * authorisation naming the contracts it covers, hand both to the relayer, and get back plaintext
 * that only this browser can read.
 *
 * Two properties are non-negotiable and are enforced here rather than by convention:
 *
 * Plaintext never leaves the tab. It is held in a module-scoped map — not `localStorage`, not
 * `sessionStorage`, not a cookie, and never in a fetch body. A refresh drops it, which is the
 * correct trade: re-revealing costs a signature, and a balance that survives in disk storage is a
 * balance that outlives the person looking at it.
 *
 * Nothing decrypted is ever logged. Not to the console, not to an error report. An exception
 * carrying a balance in its message is a leak with a stack trace attached.
 */

const DURATION_DAYS = 1;

interface Authorization {
  publicKey: string;
  privateKey: string;
  signature: string;
  startTimestamp: number;
  contracts: string[];
}

/** In-memory only. Cleared on wallet change, chain change, and page unload. */
const authorizations = new Map<string, Authorization>();
const revealed = new Map<string, bigint>();

function authKey(user: string, contracts: string[]): string {
  return `${user.toLowerCase()}|${[...contracts].map((c) => c.toLowerCase()).sort().join(",")}`;
}

function valueKey(user: string, handle: string): string {
  return `${user.toLowerCase()}|${handle.toLowerCase()}`;
}

export function clearRevealedValues(): void {
  authorizations.clear();
  revealed.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", clearRevealedValues);
}

/** A value already revealed in this tab, if any. Never triggers a wallet prompt. */
export function cachedReveal(user: string, handle: string): bigint | undefined {
  return revealed.get(valueKey(user, handle));
}

export class RevealRejectedError extends Error {
  constructor() {
    super("You declined the signature, so nothing was revealed.");
    this.name = "RevealRejectedError";
  }
}

export class RevealDeniedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RevealDeniedError";
  }
}

interface SignTypedData {
  (args: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<string>;
}

async function authorize(
  instance: FhevmInstance,
  user: string,
  contracts: string[],
  signTypedData: SignTypedData,
): Promise<Authorization> {
  const key = authKey(user, contracts);
  const existing = authorizations.get(key);
  if (existing) return existing;

  const { publicKey, privateKey } = instance.generateKeypair();
  const startTimestamp = Math.floor(Date.now() / 1000);
  const eip712 = instance.createEIP712(publicKey, contracts, startTimestamp, DURATION_DAYS);

  let signature: string;
  try {
    signature = await signTypedData({
      domain: eip712.domain,
      types: eip712.types,
      primaryType: eip712.primaryType,
      message: eip712.message,
    });
  } catch (error) {
    // A user declining is an ordinary outcome, not a failure. It gets its own type so the UI can
    // say "you declined" instead of "something went wrong".
    if (isUserRejection(error)) throw new RevealRejectedError();
    throw error;
  }

  const authorization: Authorization = {
    publicKey,
    privateKey,
    signature,
    startTimestamp,
    contracts,
  };
  authorizations.set(key, authorization);
  return authorization;
}

function isUserRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: number | string; name?: string; message?: string };
  if (candidate.code === 4001 || candidate.code === "ACTION_REJECTED") return true;
  if (candidate.name === "UserRejectedRequestError") return true;
  return typeof candidate.message === "string" && /reject|denied|cancell?ed/i.test(candidate.message);
}

/**
 * Decrypt one handle for its owner.
 *
 * The signature covers every contract listed, so revealing a savings balance and a prize result in
 * the same session costs one prompt rather than two.
 */
export async function revealValue(args: {
  user: string;
  handle: string;
  contractAddress: string;
  alsoAuthorize?: string[];
  signTypedData: SignTypedData;
}): Promise<bigint> {
  const cached = cachedReveal(args.user, args.handle);
  if (cached !== undefined) return cached;

  const instance = await getFheInstance();
  const contracts = Array.from(
    new Set([args.contractAddress, ...(args.alsoAuthorize ?? [])].map((c) => c)),
  );

  const auth = await authorize(instance, args.user, contracts, args.signTypedData);

  let results: Record<string, bigint | boolean | string>;
  try {
    results = await instance.userDecrypt(
      [{ handle: args.handle, contractAddress: args.contractAddress }],
      auth.privateKey,
      auth.publicKey,
      auth.signature,
      contracts,
      args.user,
      auth.startTimestamp,
      DURATION_DAYS,
    );
  } catch (error) {
    // An expired or mismatched authorisation is recoverable: drop it so the next attempt re-signs.
    authorizations.delete(authKey(args.user, contracts));
    // The relayer's error is attached as a cause so it can be inspected in a debugger, but it is
    // never logged — an error report from this path is one message away from carrying a balance.
    throw new RevealDeniedError(
      "The relayer would not decrypt that value for this wallet. If you recently switched " +
        "accounts, try revealing again to sign a fresh authorisation.",
      { cause: error },
    );
  }

  const raw = results[args.handle];
  if (raw === undefined) {
    throw new RevealDeniedError("The relayer returned no value for that handle.");
  }

  const value = typeof raw === "boolean" ? (raw ? 1n : 0n) : BigInt(raw);
  revealed.set(valueKey(args.user, args.handle), value);
  return value;
}
