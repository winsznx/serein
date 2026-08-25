"use client";

import { useCallback, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

import { CHAIN_ID } from "@/lib/chain";

/**
 * Every state a write can be in, and a sentence for each.
 *
 * "Something went wrong" is the failure mode this hook exists to prevent. A saver who gets that
 * string has no idea whether to retry, top up gas, switch networks, or give up — so each situation
 * is modelled separately and carries its own recovery action.
 *
 * The `encrypting` state deserves its own entry rather than being folded into a spinner: encrypting
 * an amount takes a noticeable moment, happens before the wallet ever opens, and if it is not shown
 * the app looks frozen at exactly the point where the user is deciding whether to trust it.
 */
export type TxPhase =
  | { status: "idle" }
  | { status: "encrypting" }
  | { status: "awaiting-signature" }
  | { status: "submitting"; hash?: `0x${string}` }
  | { status: "pending"; hash: `0x${string}` }
  | { status: "confirmed"; hash: `0x${string}` }
  | { status: "rejected" }
  | { status: "failed"; message: string; recovery: string; hash?: `0x${string}` };

export interface TxFlow {
  phase: TxPhase;
  busy: boolean;
  reset: () => void;
  run: (steps: TxSteps) => Promise<`0x${string}` | null>;
}

export interface TxSteps {
  /** Optional client-side work (encryption) that happens before the wallet is asked for anything. */
  prepare?: () => Promise<void>;
  /** Must return the transaction hash. Wallet interaction happens inside. */
  send: () => Promise<`0x${string}`>;
  /** Called once the receipt confirms with status "success". */
  onConfirmed?: (hash: `0x${string}`) => void | Promise<void>;
}

/** Map a chain or wallet error onto a message and a concrete next action. */
export function describeError(error: unknown): { message: string; recovery: string } {
  if (error instanceof UserRejectedRequestError) {
    return {
      message: "You declined the transaction.",
      recovery: "Nothing was sent. Try again when you are ready.",
    };
  }

  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      const known = KNOWN_REVERTS[name ?? ""];
      if (known) return known;
      return {
        message: name ? `The contract rejected this: ${name}.` : "The contract rejected this call.",
        recovery: "Reload to refresh the current state, then try again.",
      };
    }

    if (/insufficient funds/i.test(error.message)) {
      return {
        message: "Not enough Sepolia ETH to pay for gas.",
        recovery: "Top up from a Sepolia faucet, then retry. Your savings are unaffected.",
      };
    }
    if (/rate.?limit|429/i.test(error.message)) {
      return {
        message: "The network provider is rate-limiting requests.",
        recovery: "Wait a few seconds and try again.",
      };
    }
    if (/timeout|timed out/i.test(error.message)) {
      return {
        message: "The request timed out before the network answered.",
        recovery:
          "The transaction may still go through — check your wallet's activity before resending.",
      };
    }
    return {
      message: error.shortMessage || error.message,
      recovery: "Try again, or reload if the problem persists.",
    };
  }

  return {
    message: error instanceof Error ? error.message : "The transaction did not complete.",
    recovery: "Try again, or reload if the problem persists.",
  };
}

/** Contract errors a saver can actually act on, phrased for a saver rather than for a developer. */
const KNOWN_REVERTS: Record<string, { message: string; recovery: string }> = {
  FaucetCooldownActive: {
    message: "You have already claimed test tokens recently.",
    recovery: "The faucet allows one claim every four hours. The countdown is shown above.",
  },
  FaucetLifetimeCapReached: {
    message: "This address has reached the faucet's lifetime limit.",
    recovery: "Use a different address, or continue with the tokens you already hold.",
  },
  DrawNotYetClosable: {
    message: "This draw has not reached its scheduled end yet.",
    recovery: "Wait for the countdown to finish, then try again.",
  },
  UnexpectedDrawStatus: {
    message: "Someone else already advanced this draw.",
    recovery: "Reload to see the current state — the work was done, just not by you.",
  },
  AlreadyClaimed: {
    message: "This result has already been collected by this address.",
    recovery: "Nothing further to do for this draw.",
  },
  DrawNotFinalized: {
    message: "This draw has not finished yet.",
    recovery: "Wait for it to reach Complete, then collect.",
  },
  ERC7984UnauthorizedUseOfEncryptedAmount: {
    message: "The encrypted amount was not authorised for this contract.",
    recovery: "Reload the page and enter the amount again to produce a fresh encrypted input.",
  },
};

export function useTxFlow(): TxFlow {
  const [phase, setPhase] = useState<TxPhase>({ status: "idle" });
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { isConnected } = useAccount();
  const chainId = useChainId();

  const reset = useCallback(() => setPhase({ status: "idle" }), []);

  const run = useCallback(
    async (steps: TxSteps): Promise<`0x${string}` | null> => {
      if (!isConnected || !walletClient) {
        setPhase({
          status: "failed",
          message: "No wallet is connected.",
          recovery: "Connect a wallet to continue.",
        });
        return null;
      }
      if (chainId !== CHAIN_ID) {
        setPhase({
          status: "failed",
          message: "Your wallet is on the wrong network.",
          recovery: "Switch to Sepolia and try again.",
        });
        return null;
      }

      try {
        if (steps.prepare) {
          setPhase({ status: "encrypting" });
          await steps.prepare();
        }

        setPhase({ status: "awaiting-signature" });
        const hash = await steps.send();

        setPhase({ status: "pending", hash });
        const receipt = await publicClient?.waitForTransactionReceipt({ hash, confirmations: 1 });

        if (receipt && receipt.status !== "success") {
          setPhase({
            status: "failed",
            message: "The transaction was mined but reverted.",
            recovery: "Reload to refresh state, then try again.",
            hash,
          });
          return null;
        }

        setPhase({ status: "confirmed", hash });
        await steps.onConfirmed?.(hash);
        return hash;
      } catch (error) {
        if (error instanceof UserRejectedRequestError || isRejection(error)) {
          setPhase({ status: "rejected" });
          return null;
        }
        const described = describeError(error);
        setPhase({ status: "failed", ...described });
        return null;
      }
    },
    [chainId, isConnected, publicClient, walletClient],
  );

  const busy =
    phase.status === "encrypting" ||
    phase.status === "awaiting-signature" ||
    phase.status === "submitting" ||
    phase.status === "pending";

  return { phase, busy, reset, run };
}

function isRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: number | string; name?: string; message?: string };
  if (candidate.code === 4001 || candidate.code === "ACTION_REJECTED") return true;
  if (candidate.name === "UserRejectedRequestError") return true;
  return (
    typeof candidate.message === "string" && /user rejected|user denied/i.test(candidate.message)
  );
}
