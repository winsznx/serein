import type { Signer } from "ethers";

import { publicDecryptBoolean, publicDecryptNumber } from "./decrypt";
import type { SereinPool } from "../../types";

/**
 * Draw progression, written once and used by the keeper, the live-proof campaign, and anything else
 * that needs to push a draw forward.
 *
 * The same code runs against the Hardhat mock coprocessor and against the live Sepolia relayer,
 * because the plugin exposes the same `publicDecrypt` on both. That matters more than it sounds: the
 * thing being tested locally is the thing that runs in production, not a lookalike.
 *
 * Nothing here needs an authority a stranger would not have. The keeper is a convenience that keeps
 * draws punctual; if it disappears, anyone — including the web app, from a browser — can call the
 * same functions and finish the draw.
 */

export const DrawStatus = {
  None: 0n,
  Open: 1n,
  AwaitingTotalProof: 2n,
  AwaitingRandomCandidate: 3n,
  AwaitingAcceptanceProof: 4n,
  Selecting: 5n,
  AwaitingConsistencyProof: 6n,
  Finalized: 7n,
} as const;

export const DRAW_STATUS_NAMES = [
  "None",
  "Open",
  "AwaitingTotalProof",
  "AwaitingRandomCandidate",
  "AwaitingAcceptanceProof",
  "Selecting",
  "AwaitingConsistencyProof",
  "Finalized",
] as const;

export interface StepLog {
  step: string;
  txHash?: string;
  gasUsed?: string;
  detail?: Record<string, unknown>;
  at: string;
}

export interface RunnerOptions {
  batchSize?: number;
  log?: (message: string) => void;
  onStep?: (entry: StepLog) => void;
  maxRejections?: number;
}

interface Ctx {
  pool: SereinPool;
  signer: Signer;
  batchSize: number;
  log: (message: string) => void;
  onStep: (entry: StepLog) => void;
  maxRejections: number;
}

function context(pool: SereinPool, signer: Signer, options: RunnerOptions): Ctx {
  return {
    pool,
    signer,
    batchSize: options.batchSize ?? 5,
    log: options.log ?? (() => {}),
    onStep: options.onStep ?? (() => {}),
    maxRejections: options.maxRejections ?? 64,
  };
}

async function send(
  ctx: Ctx,
  step: string,
  action: () => Promise<{ hash: string; wait(): Promise<{ gasUsed: bigint } | null> }>,
  detail?: Record<string, unknown>,
): Promise<void> {
  const tx = await action();
  const receipt = await tx.wait();
  const entry: StepLog = {
    step,
    txHash: tx.hash,
    at: new Date().toISOString(),
    ...(receipt ? { gasUsed: receipt.gasUsed.toString() } : {}),
    ...(detail ? { detail } : {}),
  };
  ctx.onStep(entry);
  ctx.log(`  ${step.padEnd(28)} ${tx.hash}`);
}

/** Close the open draw if its scheduled end has passed. Returns the closed draw's id, or null. */
export async function closeIfDue(
  pool: SereinPool,
  signer: Signer,
  options: RunnerOptions = {},
): Promise<bigint | null> {
  const ctx = context(pool, signer, options);
  const drawId = await pool.currentDrawId();
  const draw = await pool.getDraw(drawId);
  if (draw.status !== DrawStatus.Open) return null;

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < draw.endTimestamp) {
    ctx.log(`  draw #${drawId} ends in ${draw.endTimestamp - now}s`);
    return null;
  }

  await send(ctx, "closeDraw", () => pool.connect(signer).closeDraw(), { drawId: drawId.toString() });
  return drawId;
}

/**
 * Advance a draw as far as it can go right now.
 *
 * Safe to call repeatedly and from anywhere. Every step re-reads the on-chain status first, so two
 * keepers racing each other lose a little gas and nothing else — the loser's transaction reverts on
 * the state machine rather than corrupting anything.
 */
export async function advanceDraw(
  pool: SereinPool,
  signer: Signer,
  drawId: bigint,
  options: RunnerOptions = {},
): Promise<{ status: bigint; rejections: number }> {
  const ctx = context(pool, signer, options);
  let rejections = 0;

  for (;;) {
    const draw = await pool.getDraw(drawId);
    const status = draw.status;

    if (status === DrawStatus.Finalized || status === DrawStatus.Open) {
      return { status, rejections };
    }

    if (status === DrawStatus.AwaitingTotalProof) {
      const handle = await pool.confidentialAggregateWeight(drawId);
      const { value: total, proof } = await publicDecryptNumber(handle);
      ctx.log(`  aggregate weight ${total}`);
      await send(
        ctx,
        "submitTotalProof",
        () => pool.connect(signer).submitTotalProof(drawId, total, proof),
        { totalWeight: total.toString(), handle },
      );
      continue;
    }

    if (status === DrawStatus.AwaitingRandomCandidate) {
      if (rejections > ctx.maxRejections) {
        throw new Error(`draw ${drawId}: rejection sampling exceeded ${ctx.maxRejections} attempts`);
      }
      await send(
        ctx,
        "generateRandomCandidate",
        () => pool.connect(signer).generateRandomCandidate(drawId),
        { attempt: (draw.randomAttempts + 1n).toString() },
      );
      continue;
    }

    if (status === DrawStatus.AwaitingAcceptanceProof) {
      const handles = await pool.drawHandles(drawId);
      const acceptanceHandle = handles[3];
      const { value: accepted, proof } = await publicDecryptBoolean(acceptanceHandle);
      if (!accepted) rejections += 1;
      ctx.log(`  candidate ${draw.randomAttempts} ${accepted ? "accepted" : "rejected"}`);
      await send(
        ctx,
        "submitAcceptanceProof",
        () => pool.connect(signer).submitAcceptanceProof(drawId, accepted, proof),
        { attempt: draw.randomAttempts.toString(), accepted, handle: acceptanceHandle },
      );
      continue;
    }

    if (status === DrawStatus.Selecting) {
      await processBatchWithBackoff(
        ctx,
        drawId,
        Number(draw.participantCount) - Number(draw.selectionCursor),
      );
      continue;
    }

    if (status === DrawStatus.AwaitingConsistencyProof) {
      const handles = await pool.drawHandles(drawId);
      const consistencyHandle = handles[4];
      const { value: consistent, proof } = await publicDecryptBoolean(consistencyHandle);
      if (!consistent) {
        throw new Error(
          `draw ${drawId}: the encrypted prefix walk did not match the verified aggregate. ` +
            `This is a correctness bug, not an operational condition — the draw stays unfinalized ` +
            `and principal is unaffected. Investigate before finalizing.`,
        );
      }
      await send(
        ctx,
        "submitConsistencyProof",
        () => pool.connect(signer).submitConsistencyProof(drawId, consistent, proof),
        { consistent, handle: consistencyHandle },
      );
      continue;
    }

    throw new Error(`draw ${drawId}: unexpected status ${status}`);
  }
}

/**
 * Walk one batch, halving on failure.
 *
 * A batch can revert for reasons that have nothing to do with this transaction being wrong: the
 * coprocessor meters HCU per block as well as per transaction, so a batch sized correctly in
 * isolation can still exceed the block's remaining budget when other people are transacting. The
 * cursor does not move on a revert, so retrying smaller is always safe and never double-processes
 * anyone.
 */
async function processBatchWithBackoff(ctx: Ctx, drawId: bigint, remaining: number): Promise<void> {
  let size = Math.min(ctx.batchSize, Math.max(1, remaining));
  let lastError: unknown;

  for (;;) {
    try {
      await send(
        ctx,
        `processSelectionBatch(${size})`,
        () => ctx.pool.connect(ctx.signer).processSelectionBatch(drawId, size),
        { batchSize: size },
      );
      return;
    } catch (error) {
      lastError = error;
      if (size === 1) break;
      size = Math.max(1, Math.floor(size / 2));
      ctx.log(`  batch reverted, retrying with ${size}`);
    }
  }

  throw new Error(
    `draw ${drawId}: selection batch failed even at size 1. ` +
      `The cursor is unchanged, so this is retryable. Cause: ${String(lastError)}`,
  );
}

/** Close if due, then push the draw all the way to finalized. */
export async function runDrawCycle(
  pool: SereinPool,
  signer: Signer,
  options: RunnerOptions = {},
): Promise<{ drawId: bigint; rejections: number } | null> {
  const closed = await closeIfDue(pool, signer, options);
  if (closed === null) {
    // Nothing to close, but an earlier draw may still be mid-flight.
    const current = await pool.currentDrawId();
    for (let id = current - 1n; id >= 1n && id > current - 8n; id--) {
      const draw = await pool.getDraw(id);
      if (draw.status !== DrawStatus.Finalized && draw.status !== DrawStatus.None) {
        const { rejections } = await advanceDraw(pool, signer, id, options);
        return { drawId: id, rejections };
      }
    }
    return null;
  }

  const { rejections } = await advanceDraw(pool, signer, closed, options);
  return { drawId: closed, rejections };
}
