import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { fhevm } from "hardhat";

import {
  DrawStatus,
  USDC,
  acquirePrivateUSDC,
  addSavings,
  deploySerein,
  fundDraw,
  revealBalance,
  revealCredit,
  runDrawToCompletion,
  takeOutSavings,
  type SereinStack,
} from "./helpers/fixture";

/**
 * The whole cycle, once, in one test. If this passes, the mechanism works end to end: acquire,
 * shield, save, reveal, close, verify the aggregate, sample, select, verify consistency, claim,
 * withdraw.
 */
describe("Serein — full cycle", function () {
  let stack: SereinStack;

  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  beforeEach(async () => {
    stack = await deploySerein();
  });

  it("completes acquire -> shield -> save -> draw -> claim -> withdraw", async () => {
    const [, alice, bob, carol] = stack.signers;
    if (!alice || !bob || !carol) throw new Error("need at least four signers");

    // Acquire test tokens and shield them.
    await acquirePrivateUSDC(stack, alice, 600n * USDC);
    await acquirePrivateUSDC(stack, bob, 300n * USDC);
    await acquirePrivateUSDC(stack, carol, 100n * USDC);

    // Fund the current draw's prize before it closes.
    const drawId = await stack.pool.currentDrawId();
    await fundDraw(stack, drawId, 500n * USDC, 250n * USDC);

    // Save. The plaintext amount never leaves the client; the pool sees only ciphertext.
    await addSavings(stack, alice, 600n * USDC);
    await addSavings(stack, bob, 300n * USDC);
    await addSavings(stack, carol, 100n * USDC);

    expect(await stack.pool.participantCount()).to.equal(3n);

    // Each saver can reveal their own balance and nobody else's.
    expect(await revealBalance(stack, alice)).to.equal(600n * USDC);
    expect(await revealBalance(stack, bob)).to.equal(300n * USDC);
    expect(await revealBalance(stack, carol)).to.equal(100n * USDC);

    const result = await runDrawToCompletion(stack, { batchSize: 3 });

    const draw = await stack.pool.getDraw(result.drawId);
    expect(draw.status).to.equal(DrawStatus.Finalized);
    expect(draw.totalVerified).to.equal(true);
    expect(draw.consistencyVerified).to.equal(true);
    expect(draw.hasWinner).to.equal(true);
    expect(draw.selectionCursor).to.equal(3);
    expect(draw.participantCount).to.equal(3);
    expect(result.totalWeight).to.be.greaterThan(0n);
    expect(result.randomBound).to.be.greaterThanOrEqual(result.totalWeight);
    expect(result.randomBound).to.be.lessThan(result.totalWeight * 2n);

    // Exactly one participant holds a non-zero credit, and it is the whole prize.
    const credits = await Promise.all([
      revealCredit(stack, result.drawId, alice),
      revealCredit(stack, result.drawId, bob),
      revealCredit(stack, result.drawId, carol),
    ]);
    const winners = credits.filter((credit) => credit > 0n);
    expect(winners).to.have.lengthOf(1);
    expect(winners[0]).to.equal(250n * USDC);

    // Everyone collects the same way. A non-winner moves an encrypted zero.
    for (const signer of [alice, bob, carol]) {
      await (await stack.reserve.connect(signer).claim(result.drawId)).wait();
    }

    // Principal is untouched by the draw.
    expect(await revealBalance(stack, alice)).to.equal(600n * USDC);
    expect(await revealBalance(stack, bob)).to.equal(300n * USDC);
    expect(await revealBalance(stack, carol)).to.equal(100n * USDC);

    // And it comes back out in full.
    await takeOutSavings(stack, alice, 600n * USDC);
    expect(await revealBalance(stack, alice)).to.equal(0n);
  });

  it("finalizes with no winner when nobody held a balance", async () => {
    const drawId = await stack.pool.currentDrawId();
    const draw = await stack.pool.getDraw(drawId);
    await time.increaseTo(draw.endTimestamp);

    const result = await runDrawToCompletion(stack);
    expect(result.totalWeight).to.equal(0n);

    const finalized = await stack.pool.getDraw(result.drawId);
    expect(finalized.status).to.equal(DrawStatus.Finalized);
    expect(finalized.hasWinner).to.equal(false);
  });
});
