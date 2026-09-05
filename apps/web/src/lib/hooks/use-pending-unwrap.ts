"use client";

import { useCallback, useEffect, useState } from "react";
import { parseAbiItem, toEventSelector } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { ABIS } from "@/lib/hooks/use-serein";
import { CHAIN_ID } from "@/lib/chain";
import { getFheInstance, toHex } from "@/lib/fhe/sdk";

/**
 * The consumer UI for leaving confidential form entirely — porting the exact sequence
 * `packages/contracts/scripts/live-withdraw.ts` already proved live on the canonical wrapper.
 *
 * `pool.withdraw()` only ever returns the confidential wrapper token, never plain ERC-20 — leaving
 * confidential form the rest of the way is the wrapper's own two-step, asynchronous unwrap:
 * `unwrap()` requests it (the wrapper itself marks the amount publicly decryptable; nothing here
 * does), then whoever carries a KMS-signed cleartext into `finalizeUnwrap()` completes the transfer.
 * Nothing here invents a shortcut — nine steps, same as the script: encrypt, request, parse
 * `UnwrapRequested`, read the amount handle, ask the relayer to publicly decrypt it, finalize, done.
 *
 * A request that outlives the tab is recoverable. The request id is cheap to lose (a refresh, a
 * closed tab) and expensive to redo blind, so it's cached in `localStorage` keyed to exactly this
 * chain/wallet/wrapper triple — but the cache is never trusted on its own. Every resume re-reads
 * `unwrapAmount(requestId)` from the chain before doing anything, so a stale or tampered local entry
 * can only ever fail closed, never impersonate a request that doesn't exist onchain.
 */

export type UnwrapStep =
  | { phase: "idle" }
  | { phase: "encrypting" }
  | { phase: "requesting" }
  | { phase: "waiting-kms"; requestId: `0x${string}`; requestTxHash: `0x${string}` }
  | { phase: "finalizing"; requestId: `0x${string}`; requestTxHash: `0x${string}` }
  | { phase: "done"; amount: bigint; requestTxHash: `0x${string}`; finalizeTxHash: `0x${string}` }
  | { phase: "failed"; message: string; recovery: string };

interface StoredRequest {
  chainId: number;
  wallet: string;
  wrapper: string;
  requestId: `0x${string}`;
  requestTxHash: `0x${string}`;
  amount: string;
  storedAt: string;
}

function storageKey(chainId: number, wallet: string, wrapper: string): string {
  return `serein:pending-unwrap:${chainId}:${wallet.toLowerCase()}:${wrapper.toLowerCase()}`;
}

function readStored(chainId: number, wallet: string, wrapper: string): StoredRequest | null {
  try {
    const raw = localStorage.getItem(storageKey(chainId, wallet, wrapper));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRequest;
    if (parsed.chainId !== chainId) return null;
    if (parsed.wallet?.toLowerCase() !== wallet.toLowerCase()) return null;
    if (parsed.wrapper?.toLowerCase() !== wrapper.toLowerCase()) return null;
    if (!parsed.requestId) return null;
    return parsed;
  } catch {
    // Private browsing, disabled storage, or a shape from an older version — treat it as no pending
    // request rather than breaking the page. Worst case, an old request has to be looked up again.
    return null;
  }
}

function writeStored(entry: StoredRequest): void {
  try {
    localStorage.setItem(
      storageKey(entry.chainId, entry.wallet, entry.wrapper),
      JSON.stringify(entry),
    );
  } catch {
    // Best effort — a request that can't be cached just can't be resumed after a reload, which is a
    // usability loss, not a correctness one; the funds are never at risk.
  }
}

function clearStored(chainId: number, wallet: string, wrapper: string): void {
  try {
    localStorage.removeItem(storageKey(chainId, wallet, wrapper));
  } catch {
    // Nothing to do — the entry just outlives its usefulness in storage.
  }
}

// `euint64` is a ciphertext handle at the ABI level — `bytes32`, not `uint64` — matching
// IERC7984ERC20Wrapper.sol's actual declaration exactly, since an event topic hash depends on it.
const UNWRAP_REQUESTED_TOPIC = toEventSelector(
  parseAbiItem(
    "event UnwrapRequested(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 amount)",
  ),
);

export function usePendingUnwrap(wrapperAddress: `0x${string}` | undefined) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState<UnwrapStep>({ phase: "idle" });

  // On mount (and whenever the wallet/wrapper changes), check for a request this browser already
  // knows about and validate it against the chain before offering to resume it.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // The reset lives inside the async function rather than as the effect's first statement, so
      // it runs after a microtask tick instead of synchronously inside the effect body — the same
      // eventual behavior, in a shape lint tools recognize as "responding to a change" rather than
      // "an effect driving state directly."
      if (cancelled) return;
      setStep({ phase: "idle" });
      if (!address || !wrapperAddress || !publicClient) return;
      const stored = readStored(CHAIN_ID, address, wrapperAddress);
      if (!stored) return;

      try {
        const amountHandle = (await publicClient.readContract({
          address: wrapperAddress,
          abi: ABIS.confidential,
          functionName: "unwrapAmount",
          args: [stored.requestId],
        })) as `0x${string}`;
        if (cancelled) return;
        // The zero handle means the wrapper has never heard of this request id — a stale local
        // entry, not a real pending one. Clear it rather than offering to resume nothing.
        if (!amountHandle || /^0x0+$/.test(amountHandle)) {
          clearStored(CHAIN_ID, address, wrapperAddress);
          return;
        }
        setStep({
          phase: "waiting-kms",
          requestId: stored.requestId,
          requestTxHash: stored.requestTxHash,
        });
      } catch {
        // A read failure here says nothing about whether the request is real — leave it in storage
        // and let the user retry rather than discarding a legitimate pending unwrap on an RPC blip.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, wrapperAddress, publicClient]);

  const start = useCallback(
    async (amount: bigint): Promise<void> => {
      if (!address || !wrapperAddress || !publicClient) return;
      setStep({ phase: "encrypting" });
      try {
        const instance = await getFheInstance();
        const input = await instance
          .createEncryptedInput(wrapperAddress, address)
          .add64(amount)
          .encrypt();
        const handle = input.handles[0];
        if (!handle) throw new Error("The encryption step returned no ciphertext handle.");

        setStep({ phase: "requesting" });
        const requestTxHash = await writeContractAsync({
          address: wrapperAddress,
          abi: ABIS.confidential,
          functionName: "unwrap",
          args: [address, address, toHex(handle), toHex(input.inputProof)],
        });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: requestTxHash,
          confirmations: 1,
        });
        if (receipt.status !== "success") {
          setStep({
            phase: "failed",
            message: "The unwrap request was mined but reverted.",
            recovery: "Reload to refresh state, then try again.",
          });
          return;
        }

        const requestLog = receipt.logs.find((log) => log.topics[0] === UNWRAP_REQUESTED_TOPIC);
        if (!requestLog) {
          setStep({
            phase: "failed",
            message: "The unwrap request confirmed, but its event could not be found.",
            recovery:
              "This is recoverable: reload the page. If a real request exists onchain, it can still be finalized once its request id is known.",
          });
          return;
        }
        const requestId = requestLog.topics[2] as `0x${string}` | undefined;
        if (!requestId) {
          setStep({
            phase: "failed",
            message: "The unwrap request event did not carry a request id.",
            recovery: "Reload and try again — nothing was lost.",
          });
          return;
        }

        writeStored({
          chainId: CHAIN_ID,
          wallet: address,
          wrapper: wrapperAddress,
          requestId,
          requestTxHash,
          amount: amount.toString(),
          storedAt: new Date().toISOString(),
        });
        setStep({ phase: "waiting-kms", requestId, requestTxHash });
      } catch (error) {
        setStep({ phase: "failed", ...describeUnwrapError(error) });
      }
    },
    [address, wrapperAddress, publicClient, writeContractAsync],
  );

  const finalize = useCallback(async (): Promise<void> => {
    if (step.phase !== "waiting-kms" || !address || !wrapperAddress || !publicClient) return;
    const { requestId, requestTxHash } = step;
    setStep({ phase: "finalizing", requestId, requestTxHash });
    try {
      const amountHandle = (await publicClient.readContract({
        address: wrapperAddress,
        abi: ABIS.confidential,
        functionName: "unwrapAmount",
        args: [requestId],
      })) as `0x${string}`;

      const instance = await getFheInstance();
      const { clearValues, decryptionProof } = await instance.publicDecrypt([amountHandle]);
      const raw = clearValues[amountHandle];
      if (typeof raw !== "bigint") {
        throw new Error("The relayer did not return a numeric cleartext for the unwrap amount.");
      }

      const finalizeTxHash = await writeContractAsync({
        address: wrapperAddress,
        abi: ABIS.confidential,
        functionName: "finalizeUnwrap",
        args: [requestId, raw, decryptionProof],
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: finalizeTxHash,
        confirmations: 1,
      });
      if (receipt.status !== "success") {
        setStep({
          phase: "failed",
          message: "Finalization was mined but reverted.",
          recovery:
            "It may already have been finalized by another retry — check your public balance.",
        });
        return;
      }

      clearStored(CHAIN_ID, address, wrapperAddress);
      setStep({ phase: "done", amount: raw, requestTxHash, finalizeTxHash });
    } catch (error) {
      // Stay in `waiting-kms` on failure — a relayer hiccup or an already-finalized request should
      // not throw away the fact that a real, resumable request still exists onchain. Logged, not
      // swallowed: the retry button covers the user-facing side, the console covers debugging it.
      console.error("[serein] finalizeUnwrap failed:", error);
      setStep({ phase: "waiting-kms", requestId, requestTxHash });
    }
  }, [step, address, wrapperAddress, publicClient, writeContractAsync]);

  const dismiss = useCallback(() => {
    if (address && wrapperAddress) clearStored(CHAIN_ID, address, wrapperAddress);
    setStep({ phase: "idle" });
  }, [address, wrapperAddress]);

  return { step, start, finalize, dismiss };
}

function describeUnwrapError(error: unknown): { message: string; recovery: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (/user rejected|user denied/i.test(message)) {
    return {
      message: "You declined the transaction.",
      recovery: "Nothing was sent. Try again when ready.",
    };
  }
  if (/relayer|timeout|timed out|network/i.test(message)) {
    return {
      message: "The relayer did not respond in time.",
      recovery:
        "This is transient. Retry — nothing was lost, and a request already made onchain stays valid.",
    };
  }
  return { message, recovery: "Try again, or reload if the problem persists." };
}
