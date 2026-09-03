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

// Alchemy's free tier — what the deployed app runs on — rejects `eth_getLogs` outright once the
// requested range exceeds 10 blocks, rather than truncating or paginating. Scanning from the
// contract's deployment block, as this hook originally did, always exceeded that and always failed;
// the failure was swallowed by a `.catch(() => [])` per call, so every draw's transcript rendered
// as "no events" without ever surfacing an error. Sepolia averages ~12s/block, so a 15-minute draw
// spans roughly 75 blocks — eight 10-block windows, not the tens of thousands between deployment
// and now.
const MAX_BLOCK_RANGE = 10n;
// A hard ceiling on how many windows one draw is allowed to cost, independent of how the block
// estimate above turns out. Guards against a bad estimate (or a caller with no timestamps at all)
// turning one page load into thousands of requests.
const MAX_WINDOWS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLogsWithRetry(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  address: `0x${string}`,
  from: bigint,
  to: bigint,
): Promise<Log[]> {
  // Alchemy's free tier caps both the block range (enforced above) and the request rate — a
  // 429 shows up as an ordinary rejected promise, indistinguishable from "no logs" unless it is
  // retried. A couple of short, backed-off retries costs little and turns a transient rate limit
  // into a slightly slower page load instead of a silently empty transcript.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await publicClient.getLogs({ address, events: EVENTS, fromBlock: from, toBlock: to });
    } catch {
      if (attempt < 2) await sleep(400 * 2 ** attempt);
    }
  }
  return [];
}

async function fetchLogsInWindows(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Log[]> {
  const windows: { from: bigint; to: bigint }[] = [];
  for (let start = fromBlock; start <= toBlock; start += MAX_BLOCK_RANGE) {
    const end = start + MAX_BLOCK_RANGE - 1n > toBlock ? toBlock : start + MAX_BLOCK_RANGE - 1n;
    windows.push({ from: start, to: end });
    if (windows.length >= MAX_WINDOWS) break;
  }

  // A couple of requests in flight at a time. The free-tier endpoint this app runs against starts
  // returning 429s well before six concurrent `eth_getLogs` calls, which — swallowed by the retry's
  // own eventual give-up — reproduced the exact symptom this whole rewrite exists to fix: a
  // transcript that loads and simply has nothing in it.
  const CONCURRENCY = 2;
  const results: Log[][] = [];
  for (let i = 0; i < windows.length; i += CONCURRENCY) {
    const slice = windows.slice(i, i + CONCURRENCY);
    const slicedResults = await Promise.all(
      slice.map(({ from, to }) => getLogsWithRetry(publicClient, address, from, to)),
    );
    results.push(...slicedResults);
  }
  return results.flat();
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
        // Estimate the draw's block range from wall-clock time, anchored to the deployment block
        // (whose timestamp is fetched once and cached by the query client) rather than an assumed
        // block time, since Sepolia's block time is not perfectly constant.
        const deployedBlock = await publicClient.getBlock({ blockNumber: deployedAtBlock });
        const blockSpan = latestBlock.number - deployedAtBlock;
        const timeSpan = latestBlock.timestamp - deployedBlock.timestamp;

        // A single division at the end, not a rate computed first and multiplied back out. Sepolia
        // averages ~12.4s/block; truncating that to a whole-number "12" and reapplying it across a
        // deployment-to-now span of tens of thousands of blocks turns a 3% rounding error into a
        // drift of thousands of blocks — enough, in practice, to miss a draw's own closing
        // transaction entirely and land the window past it.
        const estimateBlock = (targetTimestamp: bigint): bigint =>
          blockSpan > 0n && timeSpan > 0n
            ? deployedAtBlock + ((targetTimestamp - deployedBlock.timestamp) * blockSpan) / timeSpan
            : latestBlock.number;

        // Padding on both sides. The lower bound only has to absorb estimation error, now under a
        // hundred blocks even across a 69,000-block span (see above). The upper bound also has to
        // absorb however long it took a permissionless keeper to actually close and finalize the
        // draw after its nominal end; every draw run live so far did so within a few hundred blocks,
        // so this stays a few hundred windows short of the free-tier endpoint's own rate limit
        // rather than the several thousand a truly unbounded wait would need.
        const startPadding = 300n;
        const endPadding = 600n;

        const estimatedFrom = estimateBlock(window.startTimestamp);
        const estimatedTo = estimateBlock(window.endTimestamp);

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
      const logs = await fetchLogsInWindows(publicClient, address, fromBlock, toBlock);

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
