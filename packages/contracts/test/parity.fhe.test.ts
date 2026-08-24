import { expect } from "chai";
import { fhevm } from "hardhat";

import { PoolModel, TwabSeries, assertAggregateConsistency } from "@serein/reference-model";

import {
  DrawStatus,
  USDC,
  acquirePrivateUSDC,
  deploySerein,
  fundDraw,
  runDrawToCompletion,
  type SereinStack,
} from "./helpers/fixture";
import { readSeries, runScript, type ScriptedAction } from "./helpers/parity";

/**
 * Parity between the encrypted implementation and the plaintext reference model.
 *
 * The reference model is the specification written twice: once in Solidity over ciphertexts, once in
 * TypeScript over BigInts. If the two ever disagree about a weight, one of them is wrong, and these
 * tests are how that shows up as a failure rather than as a subtly unfair draw.
 *
 * The comparison goes deeper than the single number the protocol publishes. Every observation in
 * every series is read back out of contract storage, decrypted through the mock's debug path, and
 * checked against what the model says should be there — balance and cumulative, at each timestamp.
 */
describe("Serein — reference model parity", function () {
  let stack: SereinStack;

  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  beforeEach(async () => {
    stack = await deploySerein();
  });

  async function expectSeriesParity(
    account: string | null,
    model: TwabSeries,
    label: string,
  ): Promise<void> {
    const onChain = await readSeries(stack, account);
    const expected = model.snapshot();

    expect(onChain.length, `${label}: observation count`).to.equal(expected.length);
    for (const [i, observation] of onChain.entries()) {
      const reference = expected[i]!;
      expect(observation.timestamp, `${label}: observation ${i} timestamp`).to.equal(
        reference.timestamp,
      );
      expect(observation.balance, `${label}: observation ${i} balance`).to.equal(reference.balance);
      expect(observation.cumulative, `${label}: observation ${i} cumulative`).to.equal(
        reference.cumulative,
      );
    }
  }

  it("reproduces the reference series exactly through deposits, withdrawals and churn", async () => {
    const [, alice, bob, carol] = stack.signers;
    if (!alice || !bob || !carol) throw new Error("need four signers");

    await acquirePrivateUSDC(stack, alice, 1_000n * USDC);
    await acquirePrivateUSDC(stack, bob, 1_000n * USDC);
    await acquirePrivateUSDC(stack, carol, 1_000n * USDC);

    const actions: ScriptedAction[] = [
      { kind: "deposit", signer: alice, amount: 400n * USDC, atOffset: 10n },
      { kind: "deposit", signer: bob, amount: 250n * USDC, atOffset: 20n },
      { kind: "deposit", signer: carol, amount: 100n * USDC, atOffset: 600n },
      { kind: "withdraw", signer: alice, amount: 150n * USDC, atOffset: 900n },
      { kind: "deposit", signer: bob, amount: 300n * USDC, atOffset: 1_200n },
      // Deliberately over-withdraw: the clamp must take exactly the balance, not revert.
      { kind: "withdraw", signer: carol, amount: 999_999n * USDC, atOffset: 1_800n },
      { kind: "deposit", signer: alice, amount: 75n * USDC, atOffset: 2_400n },
    ];

    const run = await runScript(stack, actions);

    // Replay the same actions through the reference model at the timestamps the chain actually used.
    const index = new Map<string, number>([
      [alice.address, 0],
      [bob.address, 1],
      [carol.address, 2],
    ]);
    const model = new PoolModel(3, run.epochStart);
    for (const action of run.applied) {
      model.apply({
        kind: action.kind as "deposit" | "withdraw",
        participant: index.get(action.account)!,
        timestamp: action.timestamp,
        amount: action.amount,
      });
    }

    await expectSeriesParity(alice.address, model.users[0]!, "alice");
    await expectSeriesParity(bob.address, model.users[1]!, "bob");
    await expectSeriesParity(carol.address, model.users[2]!, "carol");
    await expectSeriesParity(null, model.aggregate, "aggregate");

    assertAggregateConsistency(model.aggregate, model.users, run.epochStart, run.epochEnd);

    // The number the protocol publishes must equal the number the model computes.
    const expectedTotal = model.aggregate.weightBetween(run.epochStart, run.epochEnd);
    const result = await runDrawToCompletion(stack, { batchSize: 3 });
    expect(result.totalWeight).to.equal(expectedTotal);

    // And the encrypted prefix walk must land on it, which is the on-chain statement that the sum
    // of the individual encrypted weights equals the published aggregate.
    const draw = await stack.pool.getDraw(result.drawId);
    expect(draw.consistencyVerified).to.equal(true);
    expect(draw.status).to.equal(DrawStatus.Finalized);
  });

  it("gives a late depositor exactly the weight the model says, not a full epoch's worth", async () => {
    const [, alice, bob] = stack.signers;
    if (!alice || !bob) throw new Error("need three signers");

    await acquirePrivateUSDC(stack, alice, 1_000n * USDC);
    await acquirePrivateUSDC(stack, bob, 1_000n * USDC);

    // Same amount, but bob arrives at 90% of the epoch and should earn a tenth of the weight.
    const run = await runScript(stack, [
      { kind: "deposit", signer: alice, amount: 500n * USDC, atOffset: 0n },
      { kind: "deposit", signer: bob, amount: 500n * USDC, atOffset: 3_240n },
    ]);

    const model = new PoolModel(2, run.epochStart);
    const index = new Map([
      [alice.address, 0],
      [bob.address, 1],
    ]);
    for (const action of run.applied) {
      model.apply({
        kind: action.kind as "deposit" | "withdraw",
        participant: index.get(action.account)!,
        timestamp: action.timestamp,
        amount: action.amount,
      });
    }

    const aliceWeight = model.users[0]!.weightBetween(run.epochStart, run.epochEnd);
    const bobWeight = model.users[1]!.weightBetween(run.epochStart, run.epochEnd);
    expect(bobWeight).to.be.lessThan(aliceWeight);

    const result = await runDrawToCompletion(stack, { batchSize: 4 });
    expect(result.totalWeight).to.equal(aliceWeight + bobWeight);
  });

  it("keeps the published aggregate unchanged by activity after the draw closed", async () => {
    const [, alice, bob] = stack.signers;
    if (!alice || !bob) throw new Error("need three signers");

    await acquirePrivateUSDC(stack, alice, 1_000n * USDC);
    await acquirePrivateUSDC(stack, bob, 1_000n * USDC);

    const run = await runScript(stack, [
      { kind: "deposit", signer: alice, amount: 600n * USDC, atOffset: 0n },
      { kind: "deposit", signer: bob, amount: 400n * USDC, atOffset: 0n },
    ]);

    const model = new PoolModel(2, run.epochStart);
    const index = new Map([
      [alice.address, 0],
      [bob.address, 1],
    ]);
    for (const action of run.applied) {
      model.apply({
        kind: action.kind as "deposit" | "withdraw",
        participant: index.get(action.account)!,
        timestamp: action.timestamp,
        amount: action.amount,
      });
    }
    const expectedTotal = model.aggregate.weightBetween(run.epochStart, run.epochEnd);

    const drawId = await stack.pool.currentDrawId();
    await fundDraw(stack, drawId, 200n * USDC, 100n * USDC);

    const result = await runDrawToCompletion(stack, { batchSize: 4 });
    expect(result.totalWeight).to.equal(expectedTotal);
    expect(result.drawId).to.equal(drawId);
  });
});
