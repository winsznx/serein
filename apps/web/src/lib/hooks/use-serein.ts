"use client";

import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import {
  ConfidentialUSDCAbi,
  MockPrizeSourceAbi,
  SereinPoolAbi,
  SereinPrizeReserveAbi,
  TestUSDCAbi,
  toDrawView,
  type DrawView,
} from "@serein/protocol-sdk";
import { CHAIN_ID, deployment } from "@/lib/chain";

/**
 * Chain reads, in one place.
 *
 * Everything the app displays comes from Sepolia through these hooks. There is no database holding a
 * shadow copy of protocol state — a second source of truth is a second thing that can be wrong, and
 * on a product whose whole claim is verifiability, a number that came from a cache nobody can audit
 * is worse than no number at all.
 */

export const ABIS = {
  pool: SereinPoolAbi,
  reserve: SereinPrizeReserveAbi,
  prizeSource: MockPrizeSourceAbi,
  underlying: TestUSDCAbi,
  confidential: ConfidentialUSDCAbi,
} as const;

export function useDeployment() {
  return useMemo(() => deployment(), []);
}

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** A ciphertext handle, or null when the contract has never written one. */
export function asHandle(value: unknown): `0x${string}` | null {
  if (typeof value !== "string") return null;
  if (value === ZERO_HANDLE) return null;
  return value as `0x${string}`;
}

export interface PoolSnapshot {
  currentDrawId: bigint;
  draw: DrawView | null;
  participantCount: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function usePoolSnapshot(): PoolSnapshot {
  const { addresses, ready } = useDeployment();

  const { data, isLoading, isError, refetch } = useReadContracts({
    allowFailure: false,
    contracts: ready
      ? [
          {
            address: addresses!.pool,
            abi: ABIS.pool,
            functionName: "currentDrawId",
            chainId: CHAIN_ID,
          },
          {
            address: addresses!.pool,
            abi: ABIS.pool,
            functionName: "participantCount",
            chainId: CHAIN_ID,
          },
        ]
      : [],
    query: { enabled: ready },
  });

  const currentDrawId = (data?.[0] as bigint | undefined) ?? 0n;
  const participantCount = Number((data?.[1] as bigint | undefined) ?? 0n);

  const drawQuery = useReadContract({
    address: ready ? addresses!.pool : undefined,
    abi: ABIS.pool,
    functionName: "getDraw",
    args: [currentDrawId],
    chainId: CHAIN_ID,
    query: { enabled: ready && currentDrawId > 0n },
  });

  const draw = drawQuery.data ? toDrawView(drawQuery.data) : null;

  return {
    currentDrawId,
    draw,
    participantCount,
    isLoading: isLoading || drawQuery.isLoading,
    isError: isError || drawQuery.isError,
    refetch: () => {
      void refetch();
      void drawQuery.refetch();
    },
  };
}

export function useDraw(drawId: bigint | undefined) {
  const { addresses, ready } = useDeployment();

  const query = useReadContract({
    address: ready ? addresses!.pool : undefined,
    abi: ABIS.pool,
    functionName: "getDraw",
    args: drawId !== undefined ? [drawId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: ready && drawId !== undefined && drawId > 0n },
  });

  return {
    ...query,
    draw: query.data ? toDrawView(query.data) : null,
  };
}

export function useDrawHandles(drawId: bigint | undefined) {
  const { addresses, ready } = useDeployment();

  const query = useReadContract({
    address: ready ? addresses!.pool : undefined,
    abi: ABIS.pool,
    functionName: "drawHandles",
    args: drawId !== undefined ? [drawId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: ready && drawId !== undefined && drawId > 0n },
  });

  const raw = query.data as readonly string[] | undefined;
  return {
    ...query,
    handles: raw
      ? {
          aggregateWeight: asHandle(raw[0]),
          randomTarget: asHandle(raw[1]),
          prefix: asHandle(raw[2]),
          pendingAcceptance: asHandle(raw[3]),
          pendingConsistency: asHandle(raw[4]),
        }
      : null,
  };
}

export interface WalletSnapshot {
  /** Public test-token balance. Not private — this is the transparent side of the boundary. */
  underlyingBalance: bigint;
  faucetCooldown: bigint;
  faucetRemaining: bigint;
  /** Handles, not values. Turning these into numbers requires the owner's signature. */
  confidentialTokenHandle: `0x${string}` | null;
  savingsHandle: `0x${string}` | null;
  isRegistered: boolean;
  isLoading: boolean;
  refetch: () => void;
}

export function useWalletSnapshot(): WalletSnapshot {
  const { address } = useAccount();
  const { addresses, ready } = useDeployment();
  const enabled = ready && Boolean(address);

  const { data, isLoading, refetch } = useReadContracts({
    allowFailure: true,
    contracts: enabled
      ? [
          {
            address: addresses!.underlyingToken,
            abi: ABIS.underlying,
            functionName: "balanceOf",
            args: [address!],
            chainId: CHAIN_ID,
          },
          {
            address: addresses!.underlyingToken,
            abi: ABIS.underlying,
            functionName: "faucetCooldownRemaining",
            args: [address!],
            chainId: CHAIN_ID,
          },
          {
            address: addresses!.underlyingToken,
            abi: ABIS.underlying,
            functionName: "faucetRemainingAllowance",
            args: [address!],
            chainId: CHAIN_ID,
          },
          {
            address: addresses!.confidentialToken,
            abi: ABIS.confidential,
            functionName: "confidentialBalanceOf",
            args: [address!],
            chainId: CHAIN_ID,
          },
          {
            address: addresses!.pool,
            abi: ABIS.pool,
            functionName: "confidentialBalanceOf",
            args: [address!],
            chainId: CHAIN_ID,
          },
          {
            address: addresses!.pool,
            abi: ABIS.pool,
            functionName: "isRegistered",
            args: [address!],
            chainId: CHAIN_ID,
          },
        ]
      : [],
    query: { enabled },
  });

  const value = <T>(index: number, fallback: T): T => {
    const entry = data?.[index];
    if (!entry || entry.status !== "success") return fallback;
    return entry.result as T;
  };

  return {
    underlyingBalance: value<bigint>(0, 0n),
    faucetCooldown: value<bigint>(1, 0n),
    faucetRemaining: value<bigint>(2, 0n),
    confidentialTokenHandle: asHandle(value<unknown>(3, null)),
    savingsHandle: asHandle(value<unknown>(4, null)),
    isRegistered: value<boolean>(5, false),
    isLoading,
    refetch: () => void refetch(),
  };
}

export function useDrawResult(drawId: bigint | undefined) {
  const { address } = useAccount();
  const { addresses, ready } = useDeployment();
  const enabled = ready && Boolean(address) && drawId !== undefined && drawId > 0n;

  const { data, isLoading, refetch } = useReadContracts({
    allowFailure: true,
    contracts: enabled
      ? [
          {
            address: addresses!.prizeReserve,
            abi: ABIS.reserve,
            functionName: "confidentialCreditOf",
            args: [drawId!, address!],
            chainId: CHAIN_ID,
          },
          {
            address: addresses!.prizeReserve,
            abi: ABIS.reserve,
            functionName: "hasClaimed",
            args: [drawId!, address!],
            chainId: CHAIN_ID,
          },
          {
            address: addresses!.prizeReserve,
            abi: ABIS.reserve,
            functionName: "isCredited",
            args: [drawId!, address!],
            chainId: CHAIN_ID,
          },
          {
            address: addresses!.prizeReserve,
            abi: ABIS.reserve,
            functionName: "confidentialPrizeOf",
            args: [drawId!],
            chainId: CHAIN_ID,
          },
        ]
      : [],
    query: { enabled },
  });

  const value = <T>(index: number, fallback: T): T => {
    const entry = data?.[index];
    if (!entry || entry.status !== "success") return fallback;
    return entry.result as T;
  };

  return {
    creditHandle: asHandle(value<unknown>(0, null)),
    hasClaimed: value<boolean>(1, false),
    isCredited: value<boolean>(2, false),
    prizeHandle: asHandle(value<unknown>(3, null)),
    isLoading,
    refetch: () => void refetch(),
  };
}

/**
 * How many savers share the pool, and whether that is enough for the aggregate to hide anything.
 *
 * With one participant the published total *is* that participant's weight. With two, either can
 * subtract their own. The product refuses to pretend otherwise, so this is surfaced wherever the
 * aggregate is shown.
 */
export function anonymitySetWarning(participantCount: number): string | null {
  if (participantCount <= 1) {
    return "You are currently the only saver. The published total for this draw is your own weight, so it discloses your position. Wait for others to join if that matters to you.";
  }
  if (participantCount === 2) {
    return "There are two savers in this draw. Either one can subtract their own weight from the published total to learn the other's. Privacy improves as the pool grows.";
  }
  if (participantCount <= 4) {
    return `There are ${participantCount} savers in this draw. With a pool this small the published total narrows the range of everyone's position.`;
  }
  return null;
}
