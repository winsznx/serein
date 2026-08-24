import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { ContractTransactionReceipt } from "ethers";
import { ethers, fhevm } from "hardhat";

import { publicDecryptBoolean, publicDecryptNumber } from "../../scripts/lib/decrypt";
import type {
  ConfidentialUSDC,
  MockPrizeSource,
  SereinPool,
  SereinPrizeReserve,
  TestUSDC,
} from "../../types";

/** Matches `DrawState.Status` in the contracts. */
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

export const DRAW_DURATION = 3_600n;
export const USDC = 1_000_000n;

export interface SereinStack {
  testUSDC: TestUSDC;
  confidentialUSDC: ConfidentialUSDC;
  reserve: SereinPrizeReserve;
  pool: SereinPool;
  prizeSource: MockPrizeSource;
  addresses: {
    testUSDC: string;
    confidentialUSDC: string;
    reserve: string;
    pool: string;
    prizeSource: string;
  };
  deployer: HardhatEthersSigner;
  signers: HardhatEthersSigner[];
}

export async function deploySerein(drawDuration = DRAW_DURATION): Promise<SereinStack> {
  const signers = await ethers.getSigners();
  const deployer = signers[0]!;

  const testUSDC = (await (await ethers.getContractFactory("TestUSDC")).deploy()) as TestUSDC;
  await testUSDC.waitForDeployment();
  const testUSDCAddress = await testUSDC.getAddress();

  const confidentialUSDC = (await (
    await ethers.getContractFactory("ConfidentialUSDC")
  ).deploy(testUSDCAddress, "https://serein.app/tokens/ptusdc.json")) as ConfidentialUSDC;
  await confidentialUSDC.waitForDeployment();
  const confidentialUSDCAddress = await confidentialUSDC.getAddress();

  const reserve = (await (
    await ethers.getContractFactory("SereinPrizeReserve")
  ).deploy(confidentialUSDCAddress, deployer.address)) as SereinPrizeReserve;
  await reserve.waitForDeployment();
  const reserveAddress = await reserve.getAddress();

  const pool = (await (
    await ethers.getContractFactory("SereinPool")
  ).deploy(confidentialUSDCAddress, reserveAddress, drawDuration)) as SereinPool;
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();

  const prizeSource = (await (
    await ethers.getContractFactory("MockPrizeSource")
  ).deploy(confidentialUSDCAddress, reserveAddress, deployer.address)) as MockPrizeSource;
  await prizeSource.waitForDeployment();
  const prizeSourceAddress = await prizeSource.getAddress();

  await (await reserve.initialize(poolAddress, prizeSourceAddress)).wait();

  return {
    testUSDC,
    confidentialUSDC,
    reserve,
    pool,
    prizeSource,
    addresses: {
      testUSDC: testUSDCAddress,
      confidentialUSDC: confidentialUSDCAddress,
      reserve: reserveAddress,
      pool: poolAddress,
      prizeSource: prizeSourceAddress,
    },
    deployer,
    signers,
  };
}

/**
 * Top up `signer` to at least `amount` of test USDC, waiting out the faucet cooldown if needed.
 *
 * The faucet is rate-limited on purpose — an unlimited mint would let one address swamp the pool's
 * aggregate weight — so tests that need more than one claim have to advance time the same way a real
 * user would have to wait.
 */
export async function ensureUnderlying(
  stack: SereinStack,
  signer: HardhatEthersSigner,
  amount: bigint,
): Promise<void> {
  for (;;) {
    const balance = await stack.testUSDC.balanceOf(signer.address);
    if (balance >= amount) return;
    const cooldown = await stack.testUSDC.faucetCooldownRemaining(signer.address);
    if (cooldown > 0n) await time.increase(cooldown + 1n);
    await (await stack.testUSDC.connect(signer).claim()).wait();
  }
}

/** Claim from the faucet and wrap the whole amount into the confidential token. */
export async function acquirePrivateUSDC(
  stack: SereinStack,
  signer: HardhatEthersSigner,
  amount: bigint,
): Promise<void> {
  await ensureUnderlying(stack, signer, amount);
  await (
    await stack.testUSDC.connect(signer).approve(stack.addresses.confidentialUSDC, amount)
  ).wait();
  await (
    await stack.confidentialUSDC.connect(signer).wrap(signer.address, amount)
  ).wait();
}

/** Deposit `amount` of confidential principal into the pool via the ERC-7984 callback. */
export async function addSavings(
  stack: SereinStack,
  signer: HardhatEthersSigner,
  amount: bigint,
): Promise<ContractTransactionReceipt> {
  const input = await fhevm
    .createEncryptedInput(stack.addresses.confidentialUSDC, signer.address)
    .add64(amount)
    .encrypt();

  const tx = await stack.confidentialUSDC
    .connect(signer)
    ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
      stack.addresses.pool,
      input.handles[0]!,
      input.inputProof,
      "0x",
    );
  const receipt = await tx.wait();
  return receipt!;
}

export async function takeOutSavings(
  stack: SereinStack,
  signer: HardhatEthersSigner,
  amount: bigint,
): Promise<ContractTransactionReceipt> {
  const input = await fhevm
    .createEncryptedInput(stack.addresses.pool, signer.address)
    .add64(amount)
    .encrypt();

  const tx = await stack.pool
    .connect(signer)
    ["withdraw(bytes32,bytes)"](input.handles[0]!, input.inputProof);
  const receipt = await tx.wait();
  return receipt!;
}

/** Move test tokens into the prize source and allocate an encrypted amount to a draw. */
export async function fundDraw(
  stack: SereinStack,
  drawId: bigint,
  underlyingAmount: bigint,
  allocation: bigint,
): Promise<void> {
  const { deployer, testUSDC, prizeSource } = stack;

  await ensureUnderlying(stack, deployer, underlyingAmount);
  await (
    await testUSDC.connect(deployer).approve(stack.addresses.prizeSource, underlyingAmount)
  ).wait();
  await (await prizeSource.connect(deployer).deposit(underlyingAmount)).wait();

  const input = await fhevm
    .createEncryptedInput(stack.addresses.prizeSource, deployer.address)
    .add64(allocation)
    .encrypt();

  await (
    await prizeSource
      .connect(deployer)
      .fundDraw(drawId, input.handles[0]!, input.inputProof)
  ).wait();
}

export async function revealBalance(
  stack: SereinStack,
  signer: HardhatEthersSigner,
): Promise<bigint> {
  const handle = await stack.pool.confidentialBalanceOf(signer.address);
  if (handle === ethers.ZeroHash) return 0n;
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, stack.addresses.pool, signer);
}

export async function revealCredit(
  stack: SereinStack,
  drawId: bigint,
  signer: HardhatEthersSigner,
): Promise<bigint> {
  const handle = await stack.reserve.confidentialCreditOf(drawId, signer.address);
  if (handle === ethers.ZeroHash) return 0n;
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, stack.addresses.reserve, signer);
}

export async function revealConfidentialTokenBalance(
  stack: SereinStack,
  signer: HardhatEthersSigner,
): Promise<bigint> {
  const handle = await stack.confidentialUSDC.confidentialBalanceOf(signer.address);
  if (handle === ethers.ZeroHash) return 0n;
  return fhevm.userDecryptEuint(
    FhevmType.euint64,
    handle,
    stack.addresses.confidentialUSDC,
    signer,
  );
}

/**
 * The four permissionless steps of a draw, exposed individually so tests can interrupt, replay, or
 * attack any one of them.
 *
 * Every one takes an optional signer and defaults to a stranger rather than the deployer, because a
 * step that only works from a privileged key would not be permissionless.
 */
export async function closeCurrentDraw(
  stack: SereinStack,
  runner?: HardhatEthersSigner,
): Promise<bigint> {
  const drawId = await stack.pool.currentDrawId();
  const draw = await stack.pool.getDraw(drawId);
  const now = BigInt(await time.latest());
  if (now < draw.endTimestamp) await time.increaseTo(draw.endTimestamp);
  await (await stack.pool.connect(runner ?? defaultRunner(stack)).closeDraw()).wait();
  return drawId;
}

export async function verifyTotal(
  stack: SereinStack,
  drawId: bigint,
  runner?: HardhatEthersSigner,
): Promise<bigint> {
  const handle = await stack.pool.confidentialAggregateWeight(drawId);
  const { value: total, proof } = await publicDecryptNumber(handle);
  await (
    await stack.pool.connect(runner ?? defaultRunner(stack)).submitTotalProof(drawId, total, proof)
  ).wait();
  return total;
}

/** Draw candidates until one is accepted. Returns the number of attempts it took. */
export async function acceptRandomCandidate(
  stack: SereinStack,
  drawId: bigint,
  runner?: HardhatEthersSigner,
): Promise<number> {
  const pool = stack.pool.connect(runner ?? defaultRunner(stack));
  let attempts = 0;
  for (;;) {
    attempts += 1;
    if (attempts > 64) throw new Error("rejection sampling failed to converge");
    await (await pool.generateRandomCandidate(drawId)).wait();

    const handles = await stack.pool.drawHandles(drawId);
    const { value: accepted, proof } = await publicDecryptBoolean(handles[3]);
    await (await pool.submitAcceptanceProof(drawId, accepted, proof)).wait();
    if (accepted) return attempts;
  }
}

export async function runSelection(
  stack: SereinStack,
  drawId: bigint,
  batchSize: number,
  runner?: HardhatEthersSigner,
): Promise<number> {
  const pool = stack.pool.connect(runner ?? defaultRunner(stack));
  let batches = 0;
  for (;;) {
    const view = await stack.pool.getDraw(drawId);
    if (view.status !== DrawStatus.Selecting) return batches;
    await (await pool.processSelectionBatch(drawId, batchSize)).wait();
    batches += 1;
  }
}

export async function verifyConsistency(
  stack: SereinStack,
  drawId: bigint,
  runner?: HardhatEthersSigner,
): Promise<boolean> {
  const handles = await stack.pool.drawHandles(drawId);
  const { value: consistent, proof } = await publicDecryptBoolean(handles[4]);
  await (
    await stack.pool
      .connect(runner ?? defaultRunner(stack))
      .submitConsistencyProof(drawId, consistent, proof)
  ).wait();
  return consistent;
}

function defaultRunner(stack: SereinStack): HardhatEthersSigner {
  return stack.signers[stack.signers.length - 1]!;
}

export interface DrawRunResult {
  drawId: bigint;
  totalWeight: bigint;
  randomBound: bigint;
  attempts: number;
  rejectedAttempts: number;
  batches: number;
}

/**
 * Drive a draw from open to finalized exactly the way a keeper does.
 *
 * Every step here is a permissionless call plus, where the protocol waits on the KMS, an off-chain
 * `publicDecrypt` whose signed result is submitted back on chain. Nothing in this helper uses an
 * authority a stranger would not also have — which is the point: if the tests needed a privileged
 * key to finish a draw, the draw would not really be permissionless.
 */
export async function runDrawToCompletion(
  stack: SereinStack,
  options: { batchSize?: number; runner?: HardhatEthersSigner } = {},
): Promise<DrawRunResult> {
  const runner = options.runner;
  const batchSize = options.batchSize ?? 5;

  const drawId = await closeCurrentDraw(stack, runner);
  const totalWeight = await verifyTotal(stack, drawId, runner);

  if (totalWeight === 0n) {
    return { drawId, totalWeight, randomBound: 0n, attempts: 0, rejectedAttempts: 0, batches: 0 };
  }

  const attempts = await acceptRandomCandidate(stack, drawId, runner);
  const batches = await runSelection(stack, drawId, batchSize, runner);
  const consistent = await verifyConsistency(stack, drawId, runner);
  if (!consistent) throw new Error(`draw ${drawId} failed its consistency check`);

  const view = await stack.pool.getDraw(drawId);
  return {
    drawId,
    totalWeight,
    randomBound: view.randomBound,
    attempts,
    rejectedAttempts: attempts - 1,
    batches,
  };
}
