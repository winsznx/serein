import type { AbiEvent, Log } from "viem";
import type { usePublicClient } from "wagmi";

/**
 * Windowed `eth_getLogs`, shared by every screen that reconstructs history from events.
 *
 * Alchemy's free tier — what the deployed app runs on — rejects `eth_getLogs` outright once the
 * requested range exceeds 10 blocks, rather than truncating or paginating. A naive scan from a
 * contract's deployment block to `latest` always exceeds that and always fails; the first version of
 * this code (in the proof view's draw transcript) let that failure get swallowed by a bare
 * `.catch(() => [])`, so the page rendered successfully with nothing in it. This module exists so
 * that mistake only had to be found and fixed once.
 */

export type PublicClient = NonNullable<ReturnType<typeof usePublicClient>>;

const MAX_BLOCK_RANGE = 10n;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLogsWithRetry(
  publicClient: PublicClient,
  address: `0x${string}`,
  events: readonly AbiEvent[],
  from: bigint,
  to: bigint,
): Promise<Log[]> {
  // Alchemy's free tier caps both the block range (enforced by the caller) and the request rate —
  // a 429 shows up as an ordinary rejected promise, indistinguishable from "no logs" unless it is
  // retried. A couple of short, backed-off retries costs little and turns a transient rate limit
  // into a slightly slower page load instead of a silently empty result.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await publicClient.getLogs({ address, events, fromBlock: from, toBlock: to });
    } catch {
      if (attempt < 2) await sleep(400 * 2 ** attempt);
    }
  }
  return [];
}

/**
 * Fetch every log for `events` between `fromBlock` and `toBlock`, in 10-block windows.
 *
 * `maxWindows` is a hard ceiling independent of how wide the caller's own range estimate turns out
 * to be — it guards against a bad estimate (or no estimate at all) turning one page load into
 * thousands of requests.
 */
export async function fetchLogsInWindows(
  publicClient: PublicClient,
  address: `0x${string}`,
  events: readonly AbiEvent[],
  fromBlock: bigint,
  toBlock: bigint,
  maxWindows = 400,
): Promise<Log[]> {
  const windows: { from: bigint; to: bigint }[] = [];
  for (let start = fromBlock; start <= toBlock; start += MAX_BLOCK_RANGE) {
    const end = start + MAX_BLOCK_RANGE - 1n > toBlock ? toBlock : start + MAX_BLOCK_RANGE - 1n;
    windows.push({ from: start, to: end });
    if (windows.length >= maxWindows) break;
  }

  // A couple of requests in flight at a time, with a small pause between batches. The free-tier
  // endpoint this app runs against starts returning 429s well before six concurrent `eth_getLogs`
  // calls — and, at the window counts a long-lived wallet's activity history can need, well before
  // even two-at-a-time sustained without a pause. A rejected request that gets retried into another
  // rejection is worse than a deliberately slower request that succeeds the first time.
  const CONCURRENCY = 2;
  const PACING_MS = 120;
  const results: Log[][] = [];
  for (let i = 0; i < windows.length; i += CONCURRENCY) {
    const slice = windows.slice(i, i + CONCURRENCY);
    const slicedResults = await Promise.all(
      slice.map(({ from, to }) => getLogsWithRetry(publicClient, address, events, from, to)),
    );
    results.push(...slicedResults);
    if (i + CONCURRENCY < windows.length) await sleep(PACING_MS);
  }
  return results.flat();
}

/**
 * Convert a wall-clock timestamp to an approximate block number, anchored to a known
 * (block, timestamp) pair rather than an assumed block time.
 *
 * The division happens once, at the end. Computing a whole-number "seconds per block" first and
 * multiplying it back out looks equivalent but is not: Sepolia averages roughly 12.4s/block, and
 * truncating that to "12" and reapplying it across a span of tens of thousands of blocks turns a 3%
 * rounding error into a drift of thousands of blocks — enough, in practice, to miss the very
 * transaction being searched for and land the window past it.
 */
export function estimateBlockForTimestamp(
  targetTimestamp: bigint,
  anchor: { block: bigint; timestamp: bigint },
  latest: { block: bigint; timestamp: bigint },
): bigint {
  const blockSpan = latest.block - anchor.block;
  const timeSpan = latest.timestamp - anchor.timestamp;
  if (blockSpan <= 0n || timeSpan <= 0n) return latest.block;
  return anchor.block + ((targetTimestamp - anchor.timestamp) * blockSpan) / timeSpan;
}
