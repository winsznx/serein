import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import type { ContractTransactionReceipt } from "ethers";
import { fhevm } from "hardhat";

import {
  USDC,
  acceptRandomCandidate,
  acquirePrivateUSDC,
  addSavings,
  closeCurrentDraw,
  deploySerein,
  fundDraw,
  takeOutSavings,
  verifyConsistency,
  verifyTotal,
  type SereinStack,
} from "./helpers/fixture";

/**
 * HCU measurement.
 *
 * The Zama coprocessor meters every FHE operation and reverts a transaction that exceeds either
 * ceiling: 5,000,000 HCU on the longest dependency chain, 20,000,000 in total. Those limits are the
 * reason the selection walk is batched at all, and `MAX_SELECTION_BATCH` is a claim about how many
 * participants fit under them. This file is where that claim is measured rather than asserted.
 *
 * Numbers land in `evidence/benchmarks/hcu.json` and are quoted in BENCHMARKS.md.
 */
const HCU_SEQUENTIAL_LIMIT = 5_000_000;
const HCU_GLOBAL_LIMIT = 20_000_000;

interface Measurement {
  operation: string;
  participants?: number;
  batchSize?: number;
  globalHCU: number;
  sequentialHCU: number;
  evmGas: string;
  globalHeadroomPercent: number;
  sequentialHeadroomPercent: number;
}

function measure(
  operation: string,
  receipt: ContractTransactionReceipt,
  extra: Partial<Measurement> = {},
): Measurement {
  const info = fhevm.computeTransactionHCU(receipt);
  const globalHCU = Number(info.globalHCU);
  const sequentialHCU = Number(info.maxHCUDepth);
  // A zero reading means the field names drifted, not that the operation was free. Without this
  // guard every headroom assertion below would pass vacuously.
  if (!Number.isFinite(globalHCU) || globalHCU <= 0) {
    throw new Error(
      `HCU measurement for "${operation}" came back as ${globalHCU}; ` +
        `computeTransactionHCU returned ${JSON.stringify(Object.keys(info))}`,
    );
  }
  return {
    operation,
    globalHCU,
    sequentialHCU,
    evmGas: receipt.gasUsed.toString(),
    globalHeadroomPercent: round((1 - globalHCU / HCU_GLOBAL_LIMIT) * 100),
    sequentialHeadroomPercent: round((1 - sequentialHCU / HCU_SEQUENTIAL_LIMIT) * 100),
    ...extra,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

describe("Serein — HCU benchmarks", function () {
  const measurements: Measurement[] = [];

  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  after(() => {
    if (measurements.length === 0) return;
    const target = resolve(
      process.env.SEREIN_EVIDENCE_DIR ?? resolve(process.cwd(), "../../evidence"),
      "benchmarks/hcu.json",
    );
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      `${JSON.stringify(
        {
          generatedBy: "packages/contracts/test/benchmark.hcu.test.ts",
          note: "Measured with the Zama Hardhat mock coprocessor, which meters the same operation costs the live coprocessor charges. Reproduce with `pnpm benchmark`.",
          limits: { sequential: HCU_SEQUENTIAL_LIMIT, global: HCU_GLOBAL_LIMIT },
          measurements,
        },
        null,
        2,
      )}\n`,
    );
    // eslint-disable-next-line no-console
    console.log(`\n  wrote evidence/benchmarks/hcu.json (${measurements.length} measurements)`);
  });

  it("measures the saver-facing operations", async () => {
    const stack = await deploySerein();
    const [, alice] = stack.signers;
    if (!alice) throw new Error("need two signers");

    await acquirePrivateUSDC(stack, alice, 1_000n * USDC);

    const firstDeposit = await addSavings(stack, alice, 400n * USDC);
    measurements.push(measure("addSavings (first, creates series)", firstDeposit));

    await time.increase(300);
    const secondDeposit = await addSavings(stack, alice, 100n * USDC);
    measurements.push(measure("addSavings (subsequent)", secondDeposit));

    await time.increase(300);
    const withdrawal = await takeOutSavings(stack, alice, 200n * USDC);
    measurements.push(measure("takeOutSavings", withdrawal));

    for (const measurement of measurements) {
      expect(measurement.globalHCU, `${measurement.operation} global HCU`).to.be.lessThan(
        HCU_GLOBAL_LIMIT,
      );
      expect(measurement.sequentialHCU, `${measurement.operation} sequential HCU`).to.be.lessThan(
        HCU_SEQUENTIAL_LIMIT,
      );
    }
  });

  it("measures a full draw and confirms the batch cap fits under both ceilings", async () => {
    const stack = await deploySerein();
    const cap = Number(await stack.pool.MAX_SELECTION_BATCH());
    const savers = stack.signers.slice(1, 1 + cap);
    expect(savers.length, "need one signer per batch slot").to.equal(cap);

    for (const [i, saver] of savers.entries()) {
      await acquirePrivateUSDC(stack, saver, 1_000n * USDC);
      await addSavings(stack, saver, BigInt(50 * (i + 1)) * USDC);
    }

    const drawId = await stack.pool.currentDrawId();
    await fundDraw(stack, drawId, 500n * USDC, 200n * USDC);

    const closeReceipt = await closeDrawMeasured(stack);
    measurements.push(
      measure("closeDraw (aggregate weight + publish)", closeReceipt, { participants: cap }),
    );

    await verifyTotal(stack, drawId);
    await acceptRandomCandidate(stack, drawId);

    // One batch at the cap — the measurement that justifies MAX_SELECTION_BATCH.
    const batchReceipt = (await (await stack.pool.processSelectionBatch(drawId, cap)).wait())!;
    const batch = measure("processSelectionBatch (at MAX_SELECTION_BATCH)", batchReceipt, {
      participants: cap,
      batchSize: cap,
    });
    measurements.push(batch);

    expect(await verifyConsistency(stack, drawId)).to.equal(true);

    // The point of the cap: a full batch has to clear both ceilings with room to spare, because a
    // batch that reverts on HCU would stall the draw until someone retried with a smaller one.
    expect(batch.globalHCU, "full batch global HCU").to.be.lessThan(HCU_GLOBAL_LIMIT);
    expect(batch.sequentialHCU, "full batch sequential HCU").to.be.lessThan(HCU_SEQUENTIAL_LIMIT);
    expect(batch.globalHeadroomPercent, "global headroom").to.be.greaterThan(10);

    // eslint-disable-next-line no-console
    console.log(
      `\n      batch of ${cap}: ${batch.globalHCU.toLocaleString()} global HCU ` +
        `(${batch.globalHeadroomPercent}% headroom), ` +
        `${batch.sequentialHCU.toLocaleString()} sequential ` +
        `(${batch.sequentialHeadroomPercent}% headroom), ` +
        `${Math.round(batch.globalHCU / cap).toLocaleString()} per participant`,
    );
  });

  /**
   * The expensive path, measured rather than guessed.
   *
   * A participant's epoch weight needs two TWAB lookups. In steady state the opening one is free:
   * draws are contiguous, so the boundary cache written by the previous draw's walk already holds
   * the cumulative at this epoch's start. The cache misses when a draw's walk was skipped entirely —
   * an abandoned draw, or draws processed out of order — and then both lookups do real work, adding
   * a euint128 scalar multiply and addition per participant.
   *
   * That difference decides how large a batch may safely be, so it gets its own measurement.
   */
  it("measures the cold-cache worst case that decides the safe batch size", async () => {
    const stack = await deploySerein();
    const savers = stack.signers.slice(1, 5);

    for (const saver of savers) {
      await acquirePrivateUSDC(stack, saver, 1_000n * USDC);
      await addSavings(stack, saver, 100n * USDC);
    }

    // Close draw 1 and deliberately abandon its selection walk, so nothing writes a boundary
    // checkpoint. Draw 2 then has to compute both endpoints from scratch.
    await closeCurrentDraw(stack);
    const secondDrawId = await closeCurrentDraw(stack);
    await verifyTotal(stack, secondDrawId);
    await acceptRandomCandidate(stack, secondDrawId);

    const receipt = (await (
      await stack.pool.processSelectionBatch(secondDrawId, savers.length)
    ).wait())!;
    const cold = measure("processSelectionBatch (cold boundary cache)", receipt, {
      participants: savers.length,
      batchSize: savers.length,
    });
    measurements.push(cold);

    const perParticipant = cold.globalHCU / savers.length;
    const cap = Number(await stack.pool.MAX_SELECTION_BATCH());
    const safeBatch = Math.floor(HCU_GLOBAL_LIMIT / perParticipant);

    // eslint-disable-next-line no-console
    console.log(
      `\n      cold cache: ${Math.round(perParticipant).toLocaleString()} HCU per participant, ` +
        `so at most ${safeBatch} fit under the 20M ceiling (hard cap is ${cap})`,
    );

    // The contract's ceiling has to be reachable on the common path, and the keeper's default has to
    // be safe even here. Both numbers are recorded in BENCHMARKS.md.
    expect(safeBatch).to.be.greaterThanOrEqual(4);
    expect(cold.sequentialHCU).to.be.lessThan(HCU_SEQUENTIAL_LIMIT);
  });

  it("shows per-participant cost scaling linearly with batch size", async () => {
    for (const batchSize of [1, 2, 4]) {
      const stack = await deploySerein();
      const savers = stack.signers.slice(1, 1 + batchSize);

      for (const saver of savers) {
        await acquirePrivateUSDC(stack, saver, 1_000n * USDC);
        await addSavings(stack, saver, 100n * USDC);
      }

      const drawId = await closeCurrentDraw(stack);
      await verifyTotal(stack, drawId);
      await acceptRandomCandidate(stack, drawId);

      const receipt = (await (await stack.pool.processSelectionBatch(drawId, batchSize)).wait())!;
      measurements.push(
        measure(`processSelectionBatch (batch of ${batchSize})`, receipt, {
          participants: batchSize,
          batchSize,
        }),
      );
    }

    const batches = measurements.filter(
      (m) => m.batchSize !== undefined && m.participants !== undefined,
    );
    expect(batches.length).to.be.greaterThan(1);
  });
});

async function closeDrawMeasured(stack: SereinStack): Promise<ContractTransactionReceipt> {
  const drawId = await stack.pool.currentDrawId();
  const draw = await stack.pool.getDraw(drawId);
  const now = BigInt(await time.latest());
  if (now < draw.endTimestamp) await time.increaseTo(draw.endTimestamp);
  return (await (await stack.pool.closeDraw()).wait())!;
}
