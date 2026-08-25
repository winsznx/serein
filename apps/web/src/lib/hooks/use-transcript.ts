"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, type Log } from "viem";
import { usePublicClient } from "wagmi";

import { deployment } from "@/lib/chain";
import { getDeployment } from "@serein/protocol-sdk";

/**
 * The on-chain transcript of a draw.
 *
 * Every claim the proof view makes points at a transaction. Reconstructing that from logs rather
 * than from a database is the point: a reader can take any hash here, open it on Etherscan, and
 * check it against what the page says. A cached summary would be faster and worth less.
 */

const EVENTS = [
  parseAbiItem(
    "event DrawClosed(uint256 indexed drawId, uint32 participantCount, bytes32 aggregateWeightHandle)",
  ),
  parseAbiItem(
    "event TotalWeightVerified(uint256 indexed drawId, uint128 totalWeight, uint128 randomBound)",
  ),
  parseAbiItem(
    "event RandomCandidateGenerated(uint256 indexed drawId, uint32 attempt, bytes32 acceptanceHandle)",
  ),
  parseAbiItem("event RandomCandidateRejected(uint256 indexed drawId, uint32 attempt)"),
  parseAbiItem("event RandomCandidateAccepted(uint256 indexed drawId, uint32 attempt)"),
  parseAbiItem(
    "event SelectionBatchProcessed(uint256 indexed drawId, uint32 fromIndex, uint32 toIndex)",
  ),
  parseAbiItem("event ConsistencyRequested(uint256 indexed drawId, bytes32 consistencyHandle)"),
  parseAbiItem(
    "event DrawFinalized(uint256 indexed drawId, bool consistencyVerified, bool hasWinner)",
  ),
  parseAbiItem(
    "event DrawOpened(uint256 indexed drawId, uint64 startTimestamp, uint64 endTimestamp)",
  ),
] as const;

export interface TranscriptEntry {
  event: string;
  txHash: `0x${string}`;
  blockNumber: bigint;
  args: Record<string, unknown>;
}

export function useDrawTranscript(drawId: bigint | undefined) {
  const publicClient = usePublicClient();
  const state = deployment();

  return useQuery({
    queryKey: ["draw-transcript", drawId?.toString(), state.commit],
    enabled: Boolean(publicClient) && state.ready && drawId !== undefined && drawId > 0n,
    staleTime: 10_000,
    queryFn: async (): Promise<TranscriptEntry[]> => {
      if (!publicClient || drawId === undefined) return [];

      const manifest = getDeployment(11155111);
      const poolEntry = manifest.contracts.SereinPool;
      if (!poolEntry) return [];

      // Start from the deployment block rather than genesis so the provider does not scan the whole
      // chain, and so a rate-limited endpoint still answers.
      const fromBlock = BigInt(poolEntry.deployedAtBlock);

      const batches = await Promise.all(
        EVENTS.map((event) =>
          publicClient
            .getLogs({
              address: poolEntry.address as `0x${string}`,
              event,
              args: { drawId },
              fromBlock,
              toBlock: "latest",
            })
            .catch(() => [] as Log[]),
        ),
      );

      const entries: TranscriptEntry[] = [];
      for (const logs of batches) {
        for (const log of logs) {
          const decoded = log as unknown as {
            eventName?: string;
            args?: Record<string, unknown>;
            transactionHash: `0x${string}`;
            blockNumber: bigint;
          };
          if (!decoded.eventName) continue;
          entries.push({
            event: decoded.eventName,
            txHash: decoded.transactionHash,
            blockNumber: decoded.blockNumber,
            args: decoded.args ?? {},
          });
        }
      }

      return entries.sort((a, b) =>
        a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? -1 : 1,
      );
    },
  });
}
