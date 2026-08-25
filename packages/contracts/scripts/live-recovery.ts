import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { ethers, fhevm } from "hardhat";

import { advanceDraw, closeIfDue, DRAW_STATUS_NAMES, type StepLog } from "./lib/draw-runner";
import { publicDecryptBoolean, publicDecryptNumber } from "./lib/decrypt";
import { addressOf, loadManifest } from "./lib/manifest";
import { initFhevm } from "./lib/relayer";
import type { SereinPool } from "../types";

/**
 * Interrupt a draw mid-selection and finish it from a different address.
 *
 * This is the liveness claim made concrete. Serein says a keeper holds no privilege and that a draw
 * survives one disappearing halfway through — but "the keeper is not special" is easy to write and
 * only meaningful if somebody has actually walked away mid-draw and watched a stranger finish it.
 *
 * The sequence: one address closes the draw and processes a single selection batch, then stops
 * entirely. A second address, which has never touched the protocol, reads the stored cursor and
 * carries on from exactly where the first stopped. Same draw, same frozen weights, same result.
 *
 * The interesting assertion is not that it finishes. It is that the cursor the second address picks
 * up is precisely the one the first left behind, and that consistency still verifies afterwards — a
 * skipped or repeated participant would fail that check.
 */
async function main(): Promise<void> {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const manifest = loadManifest(chainId);
  await initFhevm(fhevm, { requireLive: true });

  const signers = await ethers.getSigners();
  const [, keeper, , , , , erin] = signers;
  const firstOperator = keeper;
  // Deliberately a participant wallet, not the keeper: it holds no operational role at all.
  const secondOperator = erin ?? signers[2];
  if (!firstOperator || !secondOperator) throw new Error("need two distinct operator signers");

  const poolAddress = addressOf(manifest, "SereinPool");
  const pool = (await ethers.getContractAt("SereinPool", poolAddress)) as unknown as SereinPool;

  const steps: StepLog[] = [];
  const record = (entry: StepLog): void => {
    steps.push(entry);
  };

  const drawId = process.env.SEREIN_DRAW_ID
    ? BigInt(process.env.SEREIN_DRAW_ID)
    : await pool.currentDrawId();

  console.log(`\n=== Recovery drill — draw #${drawId} on ${manifest.network} ===\n`);
  console.log(`  first operator   ${await firstOperator.getAddress()}`);
  console.log(
    `  second operator  ${await secondOperator.getAddress()}  (a participant, no role)\n`,
  );

  // ---- Phase 1: the first operator gets the draw as far as one selection batch, then stops. -----
  console.log("1. First operator opens the draw and walks a single batch\n");

  await closeIfDue(pool, firstOperator, { log: console.log, onStep: record });

  let draw = await pool.getDraw(drawId);
  if (draw.status === 2n) {
    const handle = await pool.confidentialAggregateWeight(drawId);
    const { value: total, proof } = await publicDecryptNumber(handle);
    console.log(`   aggregate weight ${total.toLocaleString()}`);
    const tx = await pool.connect(firstOperator).submitTotalProof(drawId, total, proof);
    await tx.wait();
    record({ step: "submitTotalProof", txHash: tx.hash, at: new Date().toISOString() });
    console.log(`   submitTotalProof           ${tx.hash}`);
  }

  // Accept a random candidate.
  for (;;) {
    draw = await pool.getDraw(drawId);
    if (draw.status === 3n) {
      const tx = await pool.connect(firstOperator).generateRandomCandidate(drawId);
      await tx.wait();
      record({ step: "generateRandomCandidate", txHash: tx.hash, at: new Date().toISOString() });
      console.log(`   generateRandomCandidate    ${tx.hash}`);
      continue;
    }
    if (draw.status === 4n) {
      const handles = await pool.drawHandles(drawId);
      const { value: accepted, proof } = await publicDecryptBoolean(handles[3]);
      const tx = await pool.connect(firstOperator).submitAcceptanceProof(drawId, accepted, proof);
      await tx.wait();
      record({ step: "submitAcceptanceProof", txHash: tx.hash, at: new Date().toISOString() });
      console.log(`   candidate ${draw.randomAttempts} ${accepted ? "accepted" : "rejected"}`);
      continue;
    }
    break;
  }

  draw = await pool.getDraw(drawId);
  if (draw.status !== 5n)
    throw new Error(`expected Selecting, got ${DRAW_STATUS_NAMES[Number(draw.status)]}`);

  const batchTx = await pool.connect(firstOperator).processSelectionBatch(drawId, 2);
  await batchTx.wait();
  record({ step: "processSelectionBatch(2)", txHash: batchTx.hash, at: new Date().toISOString() });

  const interrupted = await pool.getDraw(drawId);
  const cursorAtInterrupt = Number(interrupted.selectionCursor);
  console.log(`   processSelectionBatch(2)   ${batchTx.hash}`);
  console.log(`\n   >>> first operator stops here.`);
  console.log(`   cursor left at ${cursorAtInterrupt} of ${interrupted.participantCount}`);
  console.log(`   status ${DRAW_STATUS_NAMES[Number(interrupted.status)]}\n`);

  if (cursorAtInterrupt >= Number(interrupted.participantCount)) {
    throw new Error("the batch finished the walk; nothing was left to recover");
  }

  // ---- Phase 2: a different address picks it up from the stored cursor. ------------------------
  console.log("2. A different address resumes from the stored cursor\n");

  const { rejections } = await advanceDraw(pool, secondOperator, drawId, {
    batchSize: 5,
    log: console.log,
    onStep: record,
  });

  const finished = await pool.getDraw(drawId);
  console.log(`\n   status ${DRAW_STATUS_NAMES[Number(finished.status)]}`);
  console.log(`   cursor ${finished.selectionCursor} of ${finished.participantCount}`);
  console.log(`   consistency verified: ${finished.consistencyVerified}`);

  if (!finished.consistencyVerified) {
    throw new Error(
      "consistency did not verify after recovery — a participant was skipped or double-counted",
    );
  }
  if (Number(finished.selectionCursor) !== Number(finished.participantCount)) {
    throw new Error("the walk did not complete");
  }

  const evidence = {
    network: manifest.network,
    chainId,
    commit: manifest.commit,
    recordedAt: new Date().toISOString(),
    drawId: drawId.toString(),
    firstOperator: await firstOperator.getAddress(),
    secondOperator: await secondOperator.getAddress(),
    participantCount: Number(finished.participantCount),
    cursorAtInterrupt,
    cursorAtFinish: Number(finished.selectionCursor),
    randomAttempts: Number(finished.randomAttempts),
    rejectedAfterResume: rejections,
    verifiedTotalWeight: finished.verifiedTotalWeight.toString(),
    consistencyVerified: finished.consistencyVerified,
    hasWinner: finished.hasWinner,
    steps,
    note:
      "The first operator stopped mid-selection. A second address that holds no operational role " +
      "read the stored cursor and finished the same draw. Consistency verified afterwards, which " +
      "would have failed had any participant been skipped or walked twice.",
  };

  const target = resolve(__dirname, "../../..", `evidence/live/recovery-draw-${drawId}.json`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`\n=== Recovery drill passed ===`);
  console.log(
    `   interrupted at ${cursorAtInterrupt}/${finished.participantCount}, resumed by a different address, finalized.`,
  );
  console.log(`   wrote evidence/live/recovery-draw-${drawId}.json`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
