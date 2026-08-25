import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import {
  DrawStatus,
  USDC,
  acceptRandomCandidate,
  acquirePrivateUSDC,
  addSavings,
  closeCurrentDraw,
  deploySerein,
  fundDraw,
  revealBalance,
  revealCredit,
  runDrawToCompletion,
  runSelection,
  takeOutSavings,
  verifyConsistency,
  verifyTotal,
  type SereinStack,
} from "./helpers/fixture";
import { publicDecryptBoolean, publicDecryptNumber } from "../scripts/lib/decrypt";

/**
 * The attacks. Each of these is something the protocol claims is impossible, expressed as a test
 * that tries it and expects to fail.
 *
 * A confidentiality claim that is only asserted in prose is a claim nobody checked. These are the
 * checks.
 */
describe("Serein — adversarial", function () {
  let stack: SereinStack;

  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  beforeEach(async () => {
    stack = await deploySerein();
  });

  describe("confidentiality", () => {
    it("lets a saver read their own balance and refuses everyone else", async () => {
      const [, alice, bob] = stack.signers;
      if (!alice || !bob) throw new Error("need three signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await addSavings(stack, alice, 500n * USDC);

      expect(await revealBalance(stack, alice)).to.equal(500n * USDC);

      const handle = await stack.pool.confidentialBalanceOf(alice.address);
      await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, stack.addresses.pool, bob)).to
        .be.rejected;
    });

    it("refuses public decryption of an individual balance", async () => {
      const [, alice] = stack.signers;
      if (!alice) throw new Error("need two signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await addSavings(stack, alice, 500n * USDC);

      const handle = await stack.pool.confidentialBalanceOf(alice.address);
      await expect(fhevm.publicDecrypt([handle])).to.be.rejected;
    });

    it("keeps historical observations unreadable by the account they belong to", async () => {
      const [, alice] = stack.signers;
      if (!alice) throw new Error("need two signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await addSavings(stack, alice, 300n * USDC);

      const [, , cumulative] = await stack.pool.observationAt(alice.address, 0n);

      // Two cumulative points would let anyone recover the balance between them, so the series is
      // granted to the contract alone — not even to the account whose history it is.
      await expect(
        fhevm.userDecryptEuint(FhevmType.euint128, cumulative, stack.addresses.pool, alice),
      ).to.be.rejected;
      await expect(fhevm.publicDecrypt([cumulative])).to.be.rejected;
    });

    it("never makes the random target decryptable, to anyone, by any route", async () => {
      const [, alice, bob] = stack.signers;
      if (!alice || !bob) throw new Error("need three signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await acquirePrivateUSDC(stack, bob, 500n * USDC);
      await addSavings(stack, alice, 400n * USDC);
      await addSavings(stack, bob, 100n * USDC);

      const result = await runDrawToCompletion(stack);
      const handles = await stack.pool.drawHandles(result.drawId);
      const randomTarget = handles[1];

      expect(randomTarget).to.not.equal(ethers.ZeroHash);
      await expect(fhevm.publicDecrypt([randomTarget])).to.be.rejected;
      await expect(
        fhevm.userDecryptEuint(FhevmType.euint128, randomTarget, stack.addresses.pool, alice),
      ).to.be.rejected;
      await expect(
        fhevm.userDecryptEuint(FhevmType.euint128, randomTarget, stack.addresses.pool, bob),
      ).to.be.rejected;
    });

    it("keeps the running prefix encrypted while publishing only the aggregate", async () => {
      const [, alice, bob] = stack.signers;
      if (!alice || !bob) throw new Error("need three signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await acquirePrivateUSDC(stack, bob, 500n * USDC);
      await addSavings(stack, alice, 400n * USDC);
      await addSavings(stack, bob, 100n * USDC);

      const result = await runDrawToCompletion(stack);
      const handles = await stack.pool.drawHandles(result.drawId);

      // The aggregate is deliberately public. Everything else in the draw is not.
      const aggregate = await publicDecryptNumber(handles[0]);
      expect(aggregate.value).to.equal(result.totalWeight);
      await expect(fhevm.publicDecrypt([handles[2]])).to.be.rejected;
    });

    it("lets a participant read only their own prize credit", async () => {
      const [, alice, bob] = stack.signers;
      if (!alice || !bob) throw new Error("need three signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await acquirePrivateUSDC(stack, bob, 500n * USDC);
      const drawId = await stack.pool.currentDrawId();
      await fundDraw(stack, drawId, 300n * USDC, 150n * USDC);
      await addSavings(stack, alice, 400n * USDC);
      await addSavings(stack, bob, 100n * USDC);

      const result = await runDrawToCompletion(stack);

      // Each can read their own.
      await revealCredit(stack, result.drawId, alice);
      await revealCredit(stack, result.drawId, bob);

      // Neither can read the other's, so claiming does not disclose who won.
      const aliceCredit = await stack.reserve.confidentialCreditOf(result.drawId, alice.address);
      await expect(
        fhevm.userDecryptEuint(FhevmType.euint64, aliceCredit, stack.addresses.reserve, bob),
      ).to.be.rejected;
      await expect(fhevm.publicDecrypt([aliceCredit])).to.be.rejected;
    });

    it("does not publish the aggregate before the draw closes", async () => {
      const [, alice] = stack.signers;
      if (!alice) throw new Error("need two signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await addSavings(stack, alice, 500n * USDC);

      const drawId = await stack.pool.currentDrawId();
      const handles = await stack.pool.drawHandles(drawId);
      // No aggregate handle exists at all while the draw is open.
      expect(handles[0]).to.equal(ethers.ZeroHash);
    });
  });

  describe("draw integrity", () => {
    async function seedTwoSavers(): Promise<void> {
      const [, alice, bob] = stack.signers;
      if (!alice || !bob) throw new Error("need three signers");
      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await acquirePrivateUSDC(stack, bob, 500n * USDC);
      await addSavings(stack, alice, 400n * USDC);
      await addSavings(stack, bob, 100n * USDC);
    }

    it("rejects a forged aggregate total", async () => {
      await seedTwoSavers();
      const drawId = await stack.pool.currentDrawId();
      const draw = await stack.pool.getDraw(drawId);
      await time.increaseTo(draw.endTimestamp);
      await (await stack.pool.closeDraw()).wait();

      const handle = await stack.pool.confidentialAggregateWeight(drawId);
      const real = await publicDecryptNumber(handle);
      const trueTotal = real.value;

      // Same proof, different number. The KMS signed the pair, not the proof alone.
      await expect(stack.pool.submitTotalProof(drawId, trueTotal + 1n, real.proof)).to.be.reverted;

      // An empty proof is not a shortcut either.
      await expect(stack.pool.submitTotalProof(drawId, trueTotal, "0x")).to.be.reverted;

      // The genuine pair still works, so the draw is not wedged by the failed attempts.
      await (await stack.pool.submitTotalProof(drawId, trueTotal, real.proof)).wait();
      expect((await stack.pool.getDraw(drawId)).totalVerified).to.equal(true);
    });

    it("rejects a replayed aggregate proof", async () => {
      await seedTwoSavers();
      const drawId = await stack.pool.currentDrawId();
      const draw = await stack.pool.getDraw(drawId);
      await time.increaseTo(draw.endTimestamp);
      await (await stack.pool.closeDraw()).wait();

      const handle = await stack.pool.confidentialAggregateWeight(drawId);
      const real = await publicDecryptNumber(handle);

      await (await stack.pool.submitTotalProof(drawId, real.value, real.proof)).wait();
      await expect(
        stack.pool.submitTotalProof(drawId, real.value, real.proof),
      ).to.be.revertedWithCustomError(stack.pool, "UnexpectedDrawStatus");
    });

    it("rejects a proof taken from a different draw", async () => {
      await seedTwoSavers();

      const firstId = await stack.pool.currentDrawId();
      const first = await stack.pool.getDraw(firstId);
      await time.increaseTo(first.endTimestamp);
      await (await stack.pool.closeDraw()).wait();
      const firstHandle = await stack.pool.confidentialAggregateWeight(firstId);
      const firstResult = await publicDecryptNumber(firstHandle);
      await (
        await stack.pool.submitTotalProof(firstId, firstResult.value, firstResult.proof)
      ).wait();

      const secondId = await stack.pool.currentDrawId();
      const second = await stack.pool.getDraw(secondId);
      await time.increaseTo(second.endTimestamp);
      await (await stack.pool.closeDraw()).wait();

      // The first draw's signed cleartext says nothing about the second draw's handle.
      await expect(stack.pool.submitTotalProof(secondId, firstResult.value, firstResult.proof)).to
        .be.reverted;
    });

    it("cannot close a draw before its scheduled end", async () => {
      await seedTwoSavers();
      await expect(stack.pool.closeDraw()).to.be.revertedWithCustomError(
        stack.pool,
        "DrawNotYetClosable",
      );
    });

    it("cannot close the same draw twice", async () => {
      await seedTwoSavers();
      const draw = await stack.pool.getDraw(await stack.pool.currentDrawId());
      await time.increaseTo(draw.endTimestamp);
      await (await stack.pool.closeDraw()).wait();
      // The next draw is open but not yet due, so a second close is refused on timing.
      await expect(stack.pool.closeDraw()).to.be.revertedWithCustomError(
        stack.pool,
        "DrawNotYetClosable",
      );
    });

    it("refuses a selection batch larger than the HCU-derived cap", async () => {
      await seedTwoSavers();
      const drawId = await closeCurrentDraw(stack);
      await verifyTotal(stack, drawId);
      await acceptRandomCandidate(stack, drawId);
      expect((await stack.pool.getDraw(drawId)).status).to.equal(DrawStatus.Selecting);

      const cap = await stack.pool.MAX_SELECTION_BATCH();
      await expect(
        stack.pool.processSelectionBatch(drawId, cap + 1n),
      ).to.be.revertedWithCustomError(stack.pool, "BatchTooLarge");
      await expect(stack.pool.processSelectionBatch(drawId, 0n)).to.be.revertedWithCustomError(
        stack.pool,
        "BatchTooLarge",
      );

      // The cap itself is accepted, so the guard is a ceiling and not an off-by-one.
      await (await stack.pool.processSelectionBatch(drawId, cap)).wait();
      expect((await stack.pool.getDraw(drawId)).selectionCursor).to.equal(2);
    });

    it("refuses out-of-order lifecycle calls at every stage", async () => {
      await seedTwoSavers();
      const drawId = await stack.pool.currentDrawId();

      // While open: nothing downstream is reachable.
      await expect(stack.pool.generateRandomCandidate(drawId)).to.be.revertedWithCustomError(
        stack.pool,
        "UnexpectedDrawStatus",
      );
      await expect(stack.pool.processSelectionBatch(drawId, 1n)).to.be.revertedWithCustomError(
        stack.pool,
        "UnexpectedDrawStatus",
      );
      await expect(
        stack.pool.submitConsistencyProof(drawId, true, "0x"),
      ).to.be.revertedWithCustomError(stack.pool, "UnexpectedDrawStatus");

      const draw = await stack.pool.getDraw(drawId);
      await time.increaseTo(draw.endTimestamp);
      await (await stack.pool.closeDraw()).wait();

      // Closed but unverified: randomness is still out of reach.
      await expect(stack.pool.generateRandomCandidate(drawId)).to.be.revertedWithCustomError(
        stack.pool,
        "UnexpectedDrawStatus",
      );
    });

    it("cannot finalize a draw twice", async () => {
      await seedTwoSavers();
      const result = await runDrawToCompletion(stack);
      await expect(
        stack.pool.submitConsistencyProof(result.drawId, true, "0x"),
      ).to.be.revertedWithCustomError(stack.pool, "UnexpectedDrawStatus");
    });

    it("selects exactly one winner and never a zero-weight participant", async () => {
      const [, alice, bob, carol] = stack.signers;
      if (!alice || !bob || !carol) throw new Error("need four signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await acquirePrivateUSDC(stack, bob, 500n * USDC);
      await acquirePrivateUSDC(stack, carol, 500n * USDC);

      const drawId = await stack.pool.currentDrawId();
      await fundDraw(stack, drawId, 300n * USDC, 120n * USDC);

      await addSavings(stack, alice, 400n * USDC);
      await addSavings(stack, bob, 100n * USDC);

      // Carol registers, then leaves before the epoch ends. Her deposit and withdrawal happen in
      // adjacent blocks, so she accrues a sliver of weight; to hold exactly zero she has to register
      // after the epoch is over, which the next assertion covers.
      await addSavings(stack, carol, 50n * USDC);
      await takeOutSavings(stack, carol, 50n * USDC);

      const result = await runDrawToCompletion(stack);
      const credits = await Promise.all([
        revealCredit(stack, result.drawId, alice),
        revealCredit(stack, result.drawId, bob),
        revealCredit(stack, result.drawId, carol),
      ]);

      expect(credits.filter((credit) => credit > 0n)).to.have.lengthOf(1);
      expect(credits.reduce((a, b) => a + b, 0n)).to.equal(120n * USDC);
    });

    it("never credits an address that registered after the draw closed", async () => {
      const [, alice, bob, carol] = stack.signers;
      if (!alice || !bob || !carol) throw new Error("need four signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await acquirePrivateUSDC(stack, bob, 500n * USDC);
      await acquirePrivateUSDC(stack, carol, 500n * USDC);

      const drawId = await stack.pool.currentDrawId();
      await fundDraw(stack, drawId, 300n * USDC, 120n * USDC);
      await addSavings(stack, alice, 400n * USDC);
      await addSavings(stack, bob, 100n * USDC);

      const draw = await stack.pool.getDraw(drawId);
      await time.increaseTo(draw.endTimestamp);
      await (await stack.pool.closeDraw()).wait();

      // Carol arrives after the participant count was frozen.
      await addSavings(stack, carol, 300n * USDC);
      expect(await stack.pool.participantCount()).to.equal(3n);
      expect((await stack.pool.getDraw(drawId)).participantCount).to.equal(2);

      await verifyTotal(stack, drawId);
      await acceptRandomCandidate(stack, drawId);
      await runSelection(stack, drawId, 5);
      expect(await verifyConsistency(stack, drawId)).to.equal(true);

      expect(await stack.reserve.isCredited(drawId, carol.address)).to.equal(false);
      expect(await revealCredit(stack, drawId, carol)).to.equal(0n);
    });
  });

  describe("funds", () => {
    it("clamps an over-withdrawal instead of reverting and leaking the balance", async () => {
      const [, alice] = stack.signers;
      if (!alice) throw new Error("need two signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await addSavings(stack, alice, 200n * USDC);

      await takeOutSavings(stack, alice, 999_999n * USDC);
      expect(await revealBalance(stack, alice)).to.equal(0n);
    });

    it("leaves principal untouched by a draw and by other people's claims", async () => {
      const [, alice, bob] = stack.signers;
      if (!alice || !bob) throw new Error("need three signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await acquirePrivateUSDC(stack, bob, 500n * USDC);
      const drawId = await stack.pool.currentDrawId();
      await fundDraw(stack, drawId, 300n * USDC, 150n * USDC);
      await addSavings(stack, alice, 400n * USDC);
      await addSavings(stack, bob, 100n * USDC);

      const before = [await revealBalance(stack, alice), await revealBalance(stack, bob)];
      const result = await runDrawToCompletion(stack);

      await (await stack.reserve.connect(alice).claim(result.drawId)).wait();
      await (await stack.reserve.connect(bob).claim(result.drawId)).wait();

      expect(await revealBalance(stack, alice)).to.equal(before[0]);
      expect(await revealBalance(stack, bob)).to.equal(before[1]);
    });

    it("refuses a second claim from the same address", async () => {
      const [, alice, bob] = stack.signers;
      if (!alice || !bob) throw new Error("need three signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await acquirePrivateUSDC(stack, bob, 500n * USDC);
      const drawId = await stack.pool.currentDrawId();
      await fundDraw(stack, drawId, 300n * USDC, 150n * USDC);
      await addSavings(stack, alice, 400n * USDC);
      await addSavings(stack, bob, 100n * USDC);

      const result = await runDrawToCompletion(stack);
      await (await stack.reserve.connect(alice).claim(result.drawId)).wait();
      await expect(stack.reserve.connect(alice).claim(result.drawId)).to.be.revertedWithCustomError(
        stack.reserve,
        "AlreadyClaimed",
      );
    });

    it("refuses a claim before the draw is finalized", async () => {
      const [, alice] = stack.signers;
      if (!alice) throw new Error("need two signers");
      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await addSavings(stack, alice, 400n * USDC);

      const drawId = await stack.pool.currentDrawId();
      await expect(stack.reserve.connect(alice).claim(drawId)).to.be.revertedWithCustomError(
        stack.reserve,
        "DrawNotFinalized",
      );
    });

    it("gives the prize reserve no authority over principal", async () => {
      // The reserve's ABI contains no function that moves pool funds. This is a structural check
      // rather than a behavioural one: there is nothing to call.
      const fragments: string[] = [];
      stack.reserve.interface.forEachFunction((fragment) => fragments.push(fragment.name));
      expect(fragments).to.not.include("withdraw");
      expect(fragments).to.not.include("sweep");
      expect(fragments).to.not.include("rescue");

      const poolFragments: string[] = [];
      stack.pool.interface.forEachFunction((fragment) => poolFragments.push(fragment.name));
      // And no path exists for anyone to nominate a winner.
      expect(poolFragments).to.not.include("setWinner");
      expect(poolFragments).to.not.include("pickWinner");
      expect(poolFragments).to.not.include("owner");
    });

    it("refuses prize funding once a draw's allocation is frozen", async () => {
      const [, alice] = stack.signers;
      if (!alice) throw new Error("need two signers");
      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await addSavings(stack, alice, 400n * USDC);

      const drawId = await stack.pool.currentDrawId();
      await fundDraw(stack, drawId, 300n * USDC, 100n * USDC);

      const draw = await stack.pool.getDraw(drawId);
      await time.increaseTo(draw.endTimestamp);
      await (await stack.pool.closeDraw()).wait();
      expect(await stack.reserve.isPrizeFrozen(drawId)).to.equal(true);

      const creditBefore = await stack.reserve.confidentialPrizeOf(drawId);
      // The transfer is refunded rather than reverted: the receiver returns encrypted false.
      await fundDraw(stack, drawId, 100n * USDC, 50n * USDC);
      expect(await stack.reserve.confidentialPrizeOf(drawId)).to.equal(creditBefore);
    });
  });

  describe("access control", () => {
    it("refuses a credit call from anyone but the pool", async () => {
      const [, alice] = stack.signers;
      if (!alice) throw new Error("need two signers");
      await expect(
        stack.reserve.connect(alice).creditParticipant(1n, alice.address, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(stack.reserve, "OnlyPool");
    });

    it("refuses a prize freeze from anyone but the pool", async () => {
      const [, alice] = stack.signers;
      if (!alice) throw new Error("need two signers");
      await expect(stack.reserve.connect(alice).freezePrize(1n)).to.be.revertedWithCustomError(
        stack.reserve,
        "OnlyPool",
      );
    });

    it("refuses a deposit callback from anything but the confidential token", async () => {
      const [, alice] = stack.signers;
      if (!alice) throw new Error("need two signers");
      await expect(
        stack.pool
          .connect(alice)
          .onConfidentialTransferReceived(alice.address, alice.address, ethers.ZeroHash, "0x"),
      ).to.be.revertedWithCustomError(stack.pool, "UnsupportedToken");
    });

    it("refuses a second initialization of the reserve", async () => {
      await expect(
        stack.reserve.initialize(stack.addresses.pool, stack.addresses.prizeSource),
      ).to.be.revertedWithCustomError(stack.reserve, "AlreadyInitialized");
    });

    it("refuses prize funding from anyone but the source", async () => {
      const [, alice] = stack.signers;
      if (!alice) throw new Error("need two signers");
      await expect(
        stack.prizeSource.connect(alice).deposit(100n * USDC),
      ).to.be.revertedWithCustomError(stack.prizeSource, "OwnableUnauthorizedAccount");
    });
  });

  describe("keeper", () => {
    it("lets any address drive a draw to completion with no special authority", async () => {
      const [, alice, bob] = stack.signers;
      const stranger = stack.signers[9];
      if (!alice || !bob || !stranger) throw new Error("need ten signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await acquirePrivateUSDC(stack, bob, 500n * USDC);
      await addSavings(stack, alice, 400n * USDC);
      await addSavings(stack, bob, 100n * USDC);

      const result = await runDrawToCompletion(stack, { runner: stranger });
      expect((await stack.pool.getDraw(result.drawId)).status).to.equal(DrawStatus.Finalized);
    });

    it("resumes a draw interrupted mid-selection, from a different address", async () => {
      const savers = stack.signers.slice(1, 7);
      const first = stack.signers[7]!;
      const second = stack.signers[8]!;

      for (const saver of savers) {
        await acquirePrivateUSDC(stack, saver, 500n * USDC);
        await addSavings(stack, saver, 100n * USDC);
      }

      const drawId = await stack.pool.currentDrawId();
      const draw = await stack.pool.getDraw(drawId);
      await time.increaseTo(draw.endTimestamp);
      await (await stack.pool.connect(first).closeDraw()).wait();

      const handle = await stack.pool.confidentialAggregateWeight(drawId);
      const total = await publicDecryptNumber(handle);
      await (
        await stack.pool.connect(first).submitTotalProof(drawId, total.value, total.proof)
      ).wait();

      for (;;) {
        await (await stack.pool.connect(first).generateRandomCandidate(drawId)).wait();
        const handles = await stack.pool.drawHandles(drawId);
        const acceptance = await publicDecryptBoolean(handles[3]);
        await (
          await stack.pool
            .connect(first)
            .submitAcceptanceProof(drawId, acceptance.value, acceptance.proof)
        ).wait();
        if (acceptance.value) break;
      }

      // First keeper walks two participants, then disappears.
      await (await stack.pool.connect(first).processSelectionBatch(drawId, 2n)).wait();
      const midway = await stack.pool.getDraw(drawId);
      expect(midway.selectionCursor).to.equal(2);
      expect(midway.status).to.equal(DrawStatus.Selecting);

      // A completely different address picks the draw up from the stored cursor.
      while ((await stack.pool.getDraw(drawId)).status === DrawStatus.Selecting) {
        await (await stack.pool.connect(second).processSelectionBatch(drawId, 2n)).wait();
      }

      const handles = await stack.pool.drawHandles(drawId);
      const consistency = await publicDecryptBoolean(handles[4]);
      await (
        await stack.pool
          .connect(second)
          .submitConsistencyProof(drawId, consistency.value, consistency.proof)
      ).wait();

      const finalized = await stack.pool.getDraw(drawId);
      expect(finalized.status).to.equal(DrawStatus.Finalized);
      expect(finalized.selectionCursor).to.equal(6);
      expect(finalized.consistencyVerified).to.equal(true);
    });

    it("keeps withdrawals available at every stage of a draw", async () => {
      const [, alice, bob] = stack.signers;
      if (!alice || !bob) throw new Error("need three signers");

      await acquirePrivateUSDC(stack, alice, 500n * USDC);
      await acquirePrivateUSDC(stack, bob, 500n * USDC);
      await addSavings(stack, alice, 400n * USDC);
      await addSavings(stack, bob, 100n * USDC);

      const drawId = await stack.pool.currentDrawId();
      const draw = await stack.pool.getDraw(drawId);
      await time.increaseTo(draw.endTimestamp);

      // Closed, aggregate proof outstanding.
      await (await stack.pool.closeDraw()).wait();
      await takeOutSavings(stack, alice, 50n * USDC);
      expect(await revealBalance(stack, alice)).to.equal(350n * USDC);

      const handle = await stack.pool.confidentialAggregateWeight(drawId);
      const total = await publicDecryptNumber(handle);
      await (await stack.pool.submitTotalProof(drawId, total.value, total.proof)).wait();

      // Total verified, randomness pending.
      await takeOutSavings(stack, alice, 50n * USDC);
      expect(await revealBalance(stack, alice)).to.equal(300n * USDC);

      for (;;) {
        await (await stack.pool.generateRandomCandidate(drawId)).wait();
        const handles = await stack.pool.drawHandles(drawId);
        const acceptance = await publicDecryptBoolean(handles[3]);
        await (
          await stack.pool.submitAcceptanceProof(drawId, acceptance.value, acceptance.proof)
        ).wait();
        if (acceptance.value) break;
      }

      // Mid-selection.
      await (await stack.pool.processSelectionBatch(drawId, 1n)).wait();
      await takeOutSavings(stack, alice, 100n * USDC);
      expect(await revealBalance(stack, alice)).to.equal(200n * USDC);

      while ((await stack.pool.getDraw(drawId)).status === DrawStatus.Selecting) {
        await (await stack.pool.processSelectionBatch(drawId, 4n)).wait();
      }

      const handles = await stack.pool.drawHandles(drawId);
      const consistency = await publicDecryptBoolean(handles[4]);

      // The consistency check still passes: none of those withdrawals moved the frozen weights.
      expect(consistency.value).to.equal(true);
      await (
        await stack.pool.submitConsistencyProof(drawId, consistency.value, consistency.proof)
      ).wait();
      expect((await stack.pool.getDraw(drawId)).status).to.equal(DrawStatus.Finalized);
    });
  });
});
