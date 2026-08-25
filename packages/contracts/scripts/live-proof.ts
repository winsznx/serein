import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";

import { advanceDraw, closeIfDue, DRAW_STATUS_NAMES, type StepLog } from "./lib/draw-runner";
import { addressOf, loadManifest } from "./lib/manifest";
import { isTransientRelayerError, withRelayerRetry, initFhevm } from "./lib/relayer";
import type {
  ConfidentialUSDC,
  MockPrizeSource,
  SereinPool,
  SereinPrizeReserve,
  TestUSDC,
} from "../types";

/**
 * The live Sepolia proof campaign.
 *
 * Runs the whole cycle with real wallets against the real relayer and writes everything it observes
 * to `evidence/live/draws/`. The point is not that it passes — a test suite already establishes
 * that. The point is that the artifacts are raw: transaction hashes anyone can open, the published
 * aggregate, the ciphertext handles, and the decrypted results for the wallets this script controls
 * and only those.
 *
 * What it deliberately does not do is decrypt anything it has no right to. Where a value is
 * encrypted, the evidence records the handle and the fact that decryption was refused, not a number
 * obtained through a back door.
 *
 * Resumable by design: every step checks on-chain state first, so a run that dies to a rate limit
 * can simply be run again.
 */

const UNIT = 1_000_000n;

interface Evidence {
  network: string;
  chainId: number;
  commit: string;
  startedAt: string;
  finishedAt?: string;
  contracts: Record<string, string>;
  participants: { role: string; address: string; savedUnits: string }[];
  prize: { underlyingWrapped: string; allocatedUnits: string; txHashes: string[] };
  draw: {
    id: string;
    startTimestamp: string;
    endTimestamp: string;
    participantCount: number;
    verifiedTotalWeight: string;
    randomBound: string;
    randomAttempts: number;
    rejectedAttempts: number;
    consistencyVerified: boolean;
    hasWinner: boolean;
    handles: Record<string, string>;
    steps: StepLog[];
    latencyMs: number;
  };
  results: {
    address: string;
    role: string;
    creditUnits: string;
    won: boolean;
    claimTxHash?: string;
    principalBeforeUnits: string;
    principalAfterUnits: string;
    principalConserved: boolean;
  }[];
  confidentialityChecks: { claim: string; outcome: string }[];
  gasTotals: Record<string, string>;
}

async function main(): Promise<void> {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const manifest = loadManifest(chainId);
  await initFhevm(fhevm, { requireLive: true });

  const signers = await ethers.getSigners();
  const [deployer, keeper, alice, bob, carol, dave, erin, frank] = signers;
  if (!deployer || !keeper || !alice || !bob || !carol) {
    throw new Error("need deployer, keeper and at least three participant signers");
  }

  const poolAddress = addressOf(manifest, "SereinPool");
  const reserveAddress = addressOf(manifest, "SereinPrizeReserve");
  const sourceAddress = addressOf(manifest, "MockPrizeSource");
  const tokenAddress = addressOf(manifest, "ConfidentialUSDC");
  const underlyingAddress = addressOf(manifest, "TestUSDC");

  const pool = (await ethers.getContractAt("SereinPool", poolAddress)) as unknown as SereinPool;
  const reserve = (await ethers.getContractAt(
    "SereinPrizeReserve",
    reserveAddress,
  )) as unknown as SereinPrizeReserve;
  const source = (await ethers.getContractAt(
    "MockPrizeSource",
    sourceAddress,
  )) as unknown as MockPrizeSource;
  const token = (await ethers.getContractAt(
    "ConfidentialUSDC",
    tokenAddress,
  )) as unknown as ConfidentialUSDC;
  const underlying = (await ethers.getContractAt(
    "TestUSDC",
    underlyingAddress,
  )) as unknown as TestUSDC;

  /**
   * Deliberately uneven stakes across six savers.
   *
   * Six matters for two reasons. It puts the pool past the point where the published aggregate
   * meaningfully narrows any individual's position, and at a batch size of five it forces the
   * selection walk across **two** batches — exercising the stored cursor on live chain rather than
   * only in tests.
   *
   * The spread (10x between smallest and largest) is what makes a winner informative: if the largest
   * stake won every draw, that would be indistinguishable from a broken weighting.
   */
  const roster: { role: string; signer: HardhatEthersSigner; amount: bigint }[] = [
    { role: "participant-a", signer: alice, amount: 100n * UNIT },
    { role: "participant-b", signer: bob, amount: 250n * UNIT },
    { role: "participant-c", signer: carol, amount: 50n * UNIT },
    ...(dave ? [{ role: "participant-d", signer: dave, amount: 500n * UNIT }] : []),
    ...(erin ? [{ role: "participant-e", signer: erin, amount: 75n * UNIT }] : []),
    ...(frank ? [{ role: "participant-f", signer: frank, amount: 300n * UNIT }] : []),
  ];

  const steps: StepLog[] = [];
  const gas: Record<string, bigint> = {};
  const track = (label: string, used: bigint): void => {
    gas[label] = (gas[label] ?? 0n) + used;
  };

  const evidence: Evidence = {
    network: manifest.network,
    chainId,
    commit: manifest.commit,
    startedAt: new Date().toISOString(),
    contracts: Object.fromEntries(
      Object.entries(manifest.contracts).map(([name, entry]) => [name, entry.address]),
    ),
    participants: [],
    prize: { underlyingWrapped: "0", allocatedUnits: "0", txHashes: [] },
    draw: {
      id: "",
      startTimestamp: "",
      endTimestamp: "",
      participantCount: 0,
      verifiedTotalWeight: "",
      randomBound: "",
      randomAttempts: 0,
      rejectedAttempts: 0,
      consistencyVerified: false,
      hasWinner: false,
      handles: {},
      steps: [],
      latencyMs: 0,
    },
    results: [],
    confidentialityChecks: [],
    gasTotals: {},
  };

  /**
   * Which draw to work on.
   *
   * Defaults to the open one. `SEREIN_DRAW_ID` targets a specific draw, which is what makes a run
   * that died partway through recoverable — gas ran out mid-claims once, and without this the only
   * way back was to start a fresh draw and lose the artifact for the one already finished.
   */
  const drawId = process.env.SEREIN_DRAW_ID
    ? BigInt(process.env.SEREIN_DRAW_ID)
    : await pool.currentDrawId();
  console.log(`\n=== Serein live proof — draw #${drawId} on ${manifest.network} ===\n`);

  // ---------------------------------------------------------------------------------------------
  // 1. Participants acquire, shield, and save.
  // ---------------------------------------------------------------------------------------------
  console.log("1. Participants save\n");
  for (const entry of roster) {
    const { role, signer, amount } = entry;
    const already = await pool.confidentialBalanceOf(signer.address);

    if (already !== ethers.ZeroHash) {
      console.log(`   ${role} already saved, skipping deposit`);
    } else {
      if ((await underlying.balanceOf(signer.address)) < amount) {
        const claimTx = await underlying.connect(signer).claim();
        const receipt = await claimTx.wait();
        track("faucet", receipt?.gasUsed ?? 0n);
        console.log(`   ${role} faucet   ${claimTx.hash}`);
      }

      const approveTx = await underlying.connect(signer).approve(tokenAddress, amount);
      track("approve", (await approveTx.wait())?.gasUsed ?? 0n);

      const wrapTx = await token.connect(signer).wrap(signer.address, amount);
      track("wrap", (await wrapTx.wait())?.gasUsed ?? 0n);
      console.log(`   ${role} wrap     ${wrapTx.hash}`);

      const input = await withRelayerRetry(
        () => fhevm.createEncryptedInput(tokenAddress, signer.address).add64(amount).encrypt(),
        { label: `encrypt deposit for ${role}`, log: (m) => console.log(m) },
      );

      const saveTx = await token
        .connect(signer)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
          poolAddress,
          input.handles[0]!,
          input.inputProof,
          "0x",
        );
      const saveReceipt = await saveTx.wait();
      track("save", saveReceipt?.gasUsed ?? 0n);
      console.log(`   ${role} save     ${saveTx.hash}  gas ${saveReceipt?.gasUsed}`);
      steps.push({
        step: `save:${role}`,
        txHash: saveTx.hash,
        at: new Date().toISOString(),
        ...(saveReceipt ? { gasUsed: saveReceipt.gasUsed.toString() } : {}),
      });
    }

    evidence.participants.push({
      role,
      address: signer.address,
      savedUnits: amount.toString(),
    });
  }

  // ---------------------------------------------------------------------------------------------
  // 2. Fund the prize. The wrap is public; the per-draw allocation is not.
  // ---------------------------------------------------------------------------------------------
  console.log("\n2. Fund the prize\n");
  if (!(await reserve.isPrizeFrozen(drawId))) {
    const prizeUnderlying = 200n * UNIT;
    const allocation = 120n * UNIT;

    if ((await underlying.balanceOf(deployer.address)) < prizeUnderlying) {
      const claimTx = await underlying.connect(deployer).claim();
      await claimTx.wait();
      console.log(`   deployer faucet ${claimTx.hash}`);
    }

    const approveTx = await underlying.connect(deployer).approve(sourceAddress, prizeUnderlying);
    await approveTx.wait();
    const depositTx = await source.connect(deployer).deposit(prizeUnderlying);
    const depositReceipt = await depositTx.wait();
    track("prize-deposit", depositReceipt?.gasUsed ?? 0n);
    console.log(`   deposit  ${depositTx.hash}  (public: ${prizeUnderlying / UNIT} tUSDC wrapped)`);

    const prizeInput = await withRelayerRetry(
      () => fhevm.createEncryptedInput(sourceAddress, deployer.address).add64(allocation).encrypt(),
      { label: "encrypt prize allocation", log: (m) => console.log(m) },
    );
    const fundTx = await source
      .connect(deployer)
      .fundDraw(drawId, prizeInput.handles[0]!, prizeInput.inputProof);
    const fundReceipt = await fundTx.wait();
    track("prize-fund", fundReceipt?.gasUsed ?? 0n);
    console.log(`   fundDraw ${fundTx.hash}  (allocation encrypted)`);

    evidence.prize = {
      underlyingWrapped: prizeUnderlying.toString(),
      allocatedUnits: allocation.toString(),
      txHashes: [depositTx.hash, fundTx.hash],
    };
    steps.push({ step: "prize:deposit", txHash: depositTx.hash, at: new Date().toISOString() });
    steps.push({ step: "prize:fundDraw", txHash: fundTx.hash, at: new Date().toISOString() });
  } else {
    console.log("   prize already frozen for this draw, skipping");
  }

  // ---------------------------------------------------------------------------------------------
  // 3. Record principal before the draw, so conservation can be checked afterwards.
  // ---------------------------------------------------------------------------------------------
  const principalBefore = new Map<string, bigint>();
  for (const { role, signer } of roster) {
    const handle = await pool.confidentialBalanceOf(signer.address);
    const value =
      handle === ethers.ZeroHash
        ? 0n
        : await withRelayerRetry(
            () => fhevm.userDecryptEuint(FhevmType.euint64, handle, poolAddress, signer),
            { label: `reveal principal for ${role}`, log: (m) => console.log(m) },
          );
    principalBefore.set(signer.address, value);
    console.log(`   ${role} principal before draw: ${ethers.formatUnits(value, 6)} ptUSDC`);
  }

  // ---------------------------------------------------------------------------------------------
  // 4. Run the draw. Every call here is permissionless; the keeper holds no privilege.
  // ---------------------------------------------------------------------------------------------
  console.log("\n3. Run the draw (keeper has no special authority)\n");
  const drawStarted = Date.now();

  const openDraw = await pool.getDraw(drawId);
  const alreadyClosed = openDraw.status !== 1n; // 1 = Open

  if (alreadyClosed) {
    console.log(`   draw #${drawId} is already past Open; advancing from where it stands`);
  } else {
    const now = Math.floor(Date.now() / 1000);
    const remaining = Number(openDraw.endTimestamp) - now;
    if (remaining > 0) {
      console.log(`   waiting ${remaining}s for draw #${drawId} to reach its scheduled end…`);
      await new Promise((done) => setTimeout(done, (remaining + 5) * 1000));
    }

    await closeIfDue(pool, keeper, {
      log: (message) => console.log(message),
      onStep: (entry) => steps.push(entry),
    });
  }

  const { rejections } = await advanceDraw(pool, keeper, drawId, {
    batchSize: 5,
    log: (message) => console.log(message),
    onStep: (entry) => steps.push(entry),
  });

  const latencyMs = Date.now() - drawStarted;
  const finalDraw = await pool.getDraw(drawId);
  const handles = await pool.drawHandles(drawId);

  console.log(`\n   status ${DRAW_STATUS_NAMES[Number(finalDraw.status)]}`);
  console.log(`   aggregate weight ${finalDraw.verifiedTotalWeight}`);
  console.log(`   randomness bound ${finalDraw.randomBound}`);
  console.log(`   candidates drawn ${finalDraw.randomAttempts} (${rejections} rejected)`);

  evidence.draw = {
    id: drawId.toString(),
    startTimestamp: finalDraw.startTimestamp.toString(),
    endTimestamp: finalDraw.endTimestamp.toString(),
    participantCount: Number(finalDraw.participantCount),
    verifiedTotalWeight: finalDraw.verifiedTotalWeight.toString(),
    randomBound: finalDraw.randomBound.toString(),
    randomAttempts: Number(finalDraw.randomAttempts),
    rejectedAttempts: rejections,
    consistencyVerified: finalDraw.consistencyVerified,
    hasWinner: finalDraw.hasWinner,
    handles: {
      aggregateWeight: handles[0],
      randomTarget: handles[1],
      prefix: handles[2],
    },
    steps,
    latencyMs,
  };

  // ---------------------------------------------------------------------------------------------
  // 5. Confidentiality checks against the live relayer — these must FAIL to succeed.
  // ---------------------------------------------------------------------------------------------
  console.log("\n4. Confidentiality checks (each must be refused)\n");

  evidence.confidentialityChecks.push(
    await expectRefused("public decryption of the random target", () =>
      fhevm.publicDecrypt([handles[1]]),
    ),
  );
  evidence.confidentialityChecks.push(
    await expectRefused("public decryption of a participant's savings balance", async () => {
      const handle = await pool.confidentialBalanceOf(alice.address);
      return fhevm.publicDecrypt([handle]);
    }),
  );
  evidence.confidentialityChecks.push(
    await expectRefused("participant B decrypting participant A's savings balance", async () => {
      const handle = await pool.confidentialBalanceOf(alice.address);
      return fhevm.userDecryptEuint(FhevmType.euint64, handle, poolAddress, bob);
    }),
  );
  evidence.confidentialityChecks.push(
    await expectRefused("decryption of participant A's historical observation", async () => {
      const observation = await pool.observationAt(alice.address, 0n);
      return fhevm.publicDecrypt([observation[2]]);
    }),
  );

  // The aggregate, by contrast, is deliberately public — and must succeed.
  const aggregate = await withRelayerRetry(() => fhevm.publicDecrypt([handles[0]]), {
    label: "publicDecrypt(aggregate)",
    log: (m) => console.log(m),
  });
  const aggregateValue = BigInt(aggregate.clearValues[handles[0] as `0x${string}`] as string);
  const aggregateMatches = aggregateValue === finalDraw.verifiedTotalWeight;
  console.log(
    `   ALLOWED  public decryption of the frozen aggregate → ${aggregateValue}` +
      ` (matches on-chain: ${aggregateMatches})`,
  );
  evidence.confidentialityChecks.push({
    claim: "public decryption of the frozen aggregate weight",
    outcome: aggregateMatches
      ? `allowed by design, value ${aggregateValue} matches the on-chain verified total`
      : `MISMATCH: relayer said ${aggregateValue}, chain says ${finalDraw.verifiedTotalWeight}`,
  });
  if (!aggregateMatches) throw new Error("aggregate mismatch between relayer and chain");

  // ---------------------------------------------------------------------------------------------
  // 6. Results, claims, and principal conservation.
  // ---------------------------------------------------------------------------------------------
  console.log("\n5. Results and claims\n");
  for (const { role, signer } of roster) {
    const creditHandle = await reserve.confidentialCreditOf(drawId, signer.address);
    const credit =
      creditHandle === ethers.ZeroHash
        ? 0n
        : await withRelayerRetry(
            () => fhevm.userDecryptEuint(FhevmType.euint64, creditHandle, reserveAddress, signer),
            { label: `reveal result for ${role}`, log: (m) => console.log(m) },
          );

    const won = credit > 0n;
    console.log(
      `   ${role} result: ${won ? `won ${ethers.formatUnits(credit, 6)} ptUSDC` : "no prize this draw"}`,
    );

    let claimTxHash: string | undefined;
    if (!(await reserve.hasClaimed(drawId, signer.address))) {
      const claimTx = await reserve.connect(signer).claim(drawId);
      const claimReceipt = await claimTx.wait();
      track("claim", claimReceipt?.gasUsed ?? 0n);
      claimTxHash = claimTx.hash;
      console.log(`   ${role} claim  ${claimTx.hash}  gas ${claimReceipt?.gasUsed}`);
    }

    const afterHandle = await pool.confidentialBalanceOf(signer.address);
    const after =
      afterHandle === ethers.ZeroHash
        ? 0n
        : await withRelayerRetry(
            () => fhevm.userDecryptEuint(FhevmType.euint64, afterHandle, poolAddress, signer),
            { label: `re-reveal principal for ${role}`, log: (m) => console.log(m) },
          );
    const before = principalBefore.get(signer.address) ?? 0n;

    evidence.results.push({
      address: signer.address,
      role,
      creditUnits: credit.toString(),
      won,
      ...(claimTxHash ? { claimTxHash } : {}),
      principalBeforeUnits: before.toString(),
      principalAfterUnits: after.toString(),
      principalConserved: before === after,
    });

    console.log(
      `   ${role} principal ${ethers.formatUnits(before, 6)} → ${ethers.formatUnits(after, 6)} ` +
        `(conserved: ${before === after})`,
    );
  }

  const winners = evidence.results.filter((r) => r.won);
  if (finalDraw.hasWinner && winners.length !== 1) {
    throw new Error(
      `expected exactly one winner among the controlled wallets, found ${winners.length}. ` +
        `If other addresses participated this is not necessarily an error, but it needs review.`,
    );
  }
  const notConserved = evidence.results.filter((r) => !r.principalConserved);
  if (notConserved.length > 0) {
    throw new Error(
      `principal changed for ${notConserved.map((r) => r.role).join(", ")} across the draw`,
    );
  }

  evidence.gasTotals = Object.fromEntries(
    Object.entries(gas).map(([label, used]) => [label, used.toString()]),
  );
  evidence.finishedAt = new Date().toISOString();

  const target = resolve(__dirname, "../../..", `evidence/live/draws/draw-${drawId}.json`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`\n=== Draw #${drawId} complete ===`);
  console.log(`   principal conserved for every participant: yes`);
  console.log(`   exactly one winner: ${winners.length === 1 ? "yes" : "n/a (no winner)"}`);
  console.log(`   wrote evidence/live/draws/draw-${drawId}.json`);
}

/**
 * Assert that the relayer refuses to decrypt something it must not decrypt.
 *
 * The subtle failure mode here is a false pass: a transient network error looks exactly like a
 * refusal if you only check that the call threw. That would let a timeout masquerade as proof of
 * confidentiality, which is worse than not testing it at all — so transient errors are retried, and
 * only a durable, non-transport rejection counts as a refusal.
 */
async function expectRefused(
  claim: string,
  attempt: () => Promise<unknown>,
): Promise<{ claim: string; outcome: string }> {
  const maxTransientRetries = 4;

  for (let tries = 0; tries <= maxTransientRetries; tries++) {
    try {
      const value = await attempt();
      console.log(`   LEAKED   ${claim} -> ${JSON.stringify(value)}`);
      throw new Error(
        `CONFIDENTIALITY FAILURE: ${claim} succeeded when it must be refused. ` +
          `This is a protocol break, not a test failure.`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("CONFIDENTIALITY FAILURE"))
        throw error;

      if (isTransientRelayerError(error)) {
        if (tries === maxTransientRetries) {
          throw new Error(
            `Could not establish whether "${claim}" is refused: the relayer kept failing for ` +
              `transport reasons. Refusing to record this as a pass — an unproven confidentiality ` +
              `claim must not look like a proven one.`,
            { cause: error },
          );
        }
        const delay = 2_000 * 2 ** tries;
        console.log(
          `   ...     transport error while testing "${claim}", retrying in ${delay / 1000}s`,
        );
        await new Promise((done) => setTimeout(done, delay));
        continue;
      }

      const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
      console.log(`   REFUSED  ${claim}`);
      return { claim, outcome: `refused: ${reason?.slice(0, 200) ?? "unknown"}` };
    }
  }

  throw new Error(`unreachable: exhausted retries testing "${claim}"`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
