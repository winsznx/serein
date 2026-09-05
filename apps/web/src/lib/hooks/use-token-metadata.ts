"use client";

import { useReadContracts } from "wagmi";

import { CHAIN_ID, deployment } from "@/lib/chain";
import {
  confidentialTokenMetadata,
  publicTokenMetadata,
  type TokenMetadata,
} from "@/lib/token-metadata";

/**
 * The deterministic token identity, confirmed against the deployed contracts themselves.
 *
 * `token-metadata.ts` already knows the right name/symbol/decimals from the manifest — this hook
 * exists to verify that against a live `name()`/`symbol()`/`decimals()` read, so the identity shown
 * is chain-first truth rather than a string Serein typed once and never checked again. The static
 * values render immediately (name/symbol/decimals never change mid-session for a given deployment),
 * and the live read only ever confirms or, if it ever disagreed, would be worth knowing about —
 * there is no third-party metadata source in this path at all.
 */
export interface TokenIdentity extends TokenMetadata {
  isLoading: boolean;
  /** `false` only if a live read actually returned a different symbol than the static metadata. */
  confirmed: boolean;
}

const READ_ABI = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

export function useTokenMetadata(): { public: TokenIdentity; confidential: TokenIdentity } {
  const state = deployment();
  const staticPublic = publicTokenMetadata();
  const staticConfidential = confidentialTokenMetadata();

  const { data, isLoading } = useReadContracts({
    allowFailure: true,
    contracts: state.ready
      ? [
          {
            address: staticPublic.address,
            abi: READ_ABI,
            functionName: "symbol",
            chainId: CHAIN_ID,
          },
          {
            address: staticConfidential.address,
            abi: READ_ABI,
            functionName: "symbol",
            chainId: CHAIN_ID,
          },
        ]
      : [],
    query: { enabled: state.ready, staleTime: Infinity, gcTime: Infinity },
  });

  const publicSymbol = data?.[0]?.status === "success" ? (data[0].result as string) : null;
  const confidentialSymbol = data?.[1]?.status === "success" ? (data[1].result as string) : null;

  return {
    public: {
      ...staticPublic,
      isLoading,
      confirmed: publicSymbol === null ? true : publicSymbol === staticPublic.symbol,
    },
    confidential: {
      ...staticConfidential,
      isLoading,
      confirmed:
        confidentialSymbol === null ? true : confidentialSymbol === staticConfidential.symbol,
    },
  };
}

/** Exposed so a detail sheet showing every field doesn't have to redeclare the same tiny ABI. */
export const TOKEN_READ_ABI = READ_ABI;
