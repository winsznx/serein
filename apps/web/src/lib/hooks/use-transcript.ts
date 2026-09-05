"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { deployment } from "@/lib/chain";
import { estimateBlockForTimestamp, fetchLogsInWindows } from "@/lib/chain-logs";
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

export function useDrawTranscript(
  drawId: bigint | undefined,
  window?: { startTimestamp: bigint; endTimestamp: bigint },
) {
  const publicClient = usePublicClient();
  const state = deployment();

  return useQuery({
    queryKey: [
      "draw-transcript",
      drawId?.toString(),
      state.commit,
      window?.startTimestamp.toString(),
      window?.endTimestamp.toString(),
    ],
    enabled:
      Boolean(publicClient) &&
      state.ready &&
      drawId !== undefined &&
      drawId > 0n &&
      window !== undefined,
    staleTime: 10_000,
    queryFn: async (): Promise<TranscriptEntry[]> => {
      if (!publicClient || drawId === undefined) return [];

      const manifest = getDeployment(11155111);
      const poolEntry = manifest.contracts.SereinPool;
      if (!poolEntry) return [];
      const address = poolEntry.address as `0x${string}`;
      const deployedAtBlock = BigInt(poolEntry.deployedAtBlock);

      const latestBlock = await publicClient.getBlock({ blockTag: "latest" });

      let fromBlock = deployedAtBlock;
      let toBlock = latestBlock.number;

      if (window) {
        const deployedBlock = await publicClient.getBlock({ blockNumber: deployedAtBlock });
        const anchor = { block: deployedAtBlock, timestamp: deployedBlock.timestamp };
        const latest = { block: latestBlock.number, timestamp: latestBlock.timestamp };

        // Padding on both sides. The lower bound only has to absorb estimation error, now under a
        // hundred blocks even across a 69,000-block span (see `estimateBlockForTimestamp`). The
        // upper bound also has to absorb however long it took a permissionless keeper to actually
        // close and finalize the draw after its nominal end; every draw run live so far did so
        // within a few hundred blocks, so this stays a few hundred windows short of the free-tier
        // endpoint's own rate limit rather than the several thousand a truly unbounded wait would
        // need.
        const startPadding = 300n;
        const endPadding = 600n;

        const estimatedFrom = estimateBlockForTimestamp(window.startTimestamp, anchor, latest);
        const estimatedTo = estimateBlockForTimestamp(window.endTimestamp, anchor, latest);

        fromBlock =
          estimatedFrom - startPadding > deployedAtBlock
            ? estimatedFrom - startPadding
            : deployedAtBlock;
        toBlock =
          estimatedTo + endPadding < latestBlock.number
            ? estimatedTo + endPadding
            : latestBlock.number;
      }

      // Without a timestamp window there is no way to bound the estimate, so the fixed window cap
      // is the only thing keeping this from trying to page through the whole deployment history.
      const logs = await fetchLogsInWindows(publicClient, address, EVENTS, fromBlock, toBlock);

      const entries: TranscriptEntry[] = [];
      for (const log of logs) {
        const decoded = log as unknown as {
          eventName?: string;
          args?: Record<string, unknown>;
          transactionHash: `0x${string}`;
          blockNumber: bigint;
        };
        if (!decoded.eventName) continue;
        if (decoded.args?.drawId !== drawId) continue;
        entries.push({
          event: decoded.eventName,
          txHash: decoded.transactionHash,
          blockNumber: decoded.blockNumber,
          args: decoded.args ?? {},
        });
      }

      return entries.sort((a, b) =>
        a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? -1 : 1,
      );
    },
  });
}
