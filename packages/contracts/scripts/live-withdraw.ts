import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm } from "hardhat";

import { publicDecryptNumber } from "./lib/decrypt";
import { addressOf, loadManifest } from "./lib/manifest";
import { withRelayerRetry, initFhevm } from "./lib/relayer";
import type { SereinPool } from "../types";

/**
 * Demonstrate withdrawal on live Sepolia, end to end — out of the pool, out of confidential form,
 * and back to plain public USDC in the saver's own wallet.
 *
 * Three properties, in order:
 *
 *   1. Principal comes out of the pool for exactly the amount asked, encrypted end to end.
 *   2. Over-withdrawing is clamped rather than reverted, so a failed transaction can never be used
 *      as an oracle against a balance the protocol is supposed to keep private. Reverting on "amount
 *      exceeds balance" would let anyone binary-search someone else's balance by watching which
 *      withdrawals succeed; Serein takes whatever is actually there instead.
 *   3. Leaving the pool does not mean leaving confidential form — `pool.withdraw()` returns the
 *      confidential wrapper token, not plain ERC-20. Converting the rest of the way is the wrapper's
 *      own two-step unwrap: `unwrap()` requests it and the wrapper itself marks the amount publicly
 *      decryptable (nothing in Serein does that), then anyone can carry a KMS-signed cleartext into
 *      `finalizeUnwrap()` to complete the ERC-20 transfer. This script does both steps itself so the
 *      artifact shows the saver's plain USDC balance actually increasing, not merely a confidential
 *      transfer that still needs converting.
 */
async function main(): Promise<void> {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const manifest = loadManifest(chainId);
  await initFhevm(fhevm);

  const signers = await ethers.getSigners();
  const saver = signers[2];
  if (!saver) throw new Error("need a participant signer");

  const poolAddress = addressOf(manifest, "SereinPool");
  const tokenAddress = addressOf(manifest, "ConfidentialUSDC");
  const underlyingAddress = addressOf(manifest, "TestUSDC");
  const pool = (await ethers.getContractAt("SereinPool", poolAddress)) as unknown as SereinPool;
  const token = await ethers.getContractAt("ConfidentialUSDC", tokenAddress);
  const underlying = await ethers.getContractAt("TestUSDC", underlyingAddress);

  // Display labels only — the "ConfidentialUSDC"/"TestUSDC" manifest slots hold Zama's own
  // registered cUSDCMock/USDCMock on the canonical deployment, not a Serein-owned pair.
  const isZamaCanonical = manifest.tokenSource === "zama-canonical";
  const confidentialSymbol = isZamaCanonical ? "cUSDCMock" : "ptUSDC";
  const underlyingSymbol = isZamaCanonical ? "USDCMock" : "tUSDC";

  const reveal = async (): Promise<bigint> => {
    const handle = await pool.confidentialBalanceOf(saver.address);
    if (handle === ethers.ZeroHash) return 0n;
    return withRelayerRetry(
      () => fhevm.userDecryptEuint(FhevmType.euint64, handle, poolAddress, saver),
      { label: "reveal principal", log: (m) => console.log(m) },
    );
  };

  const revealWrapped = async (): Promise<bigint> => {
    const handle = await token.confidentialBalanceOf(saver.address);
    if (handle === ethers.ZeroHash) return 0n;
    return withRelayerRetry(
      () => fhevm.userDecryptEuint(FhevmType.euint64, handle, tokenAddress, saver),
      { label: "reveal confidential balance", log: (m) => console.log(m) },
    );
  };

  const withdraw = async (amount: bigint): Promise<{ hash: string; gasUsed: string }> => {
    const input = await withRelayerRetry(
      () => fhevm.createEncryptedInput(poolAddress, saver.address).add64(amount).encrypt(),
      { label: "encrypt withdrawal amount", log: (m) => console.log(m) },
    );
    const tx = await pool
      .connect(saver)
      ["withdraw(bytes32,bytes)"](input.handles[0]!, input.inputProof);
    const receipt = await tx.wait();
    return { hash: tx.hash, gasUsed: (receipt?.gasUsed ?? 0n).toString() };
  };

  console.log(`Live withdrawal demonstration on ${manifest.network}`);
  console.log(`  saver   ${saver.address}`);
  console.log(`  gas     ${ethers.formatEther(await ethers.provider.getBalance(saver))} ETH\n`);

  const opening = await reveal();
  console.log(`1. opening principal: ${ethers.formatUnits(opening, 6)} ${confidentialSymbol}`);
  if (opening === 0n) throw new Error("nothing to withdraw");

  const partial = opening / 4n;
  console.log(
    `\n2. withdrawing ${ethers.formatUnits(partial, 6)} ${confidentialSymbol} (a quarter)`,
  );
  const partialTx = await withdraw(partial);
  console.log(`   ${partialTx.hash}  gas ${partialTx.gasUsed}`);

  const afterPartial = await reveal();
  console.log(`   principal now: ${ethers.formatUnits(afterPartial, 6)} ${confidentialSymbol}`);
  const partialExact = afterPartial === opening - partial;
  console.log(`   exact: ${partialExact}`);
  if (!partialExact) {
    throw new Error(`expected ${opening - partial}, got ${afterPartial}`);
  }

  // Ask for far more than remains. A reverting contract would leak the balance through the failure;
  // this one takes exactly what is there.
  const absurd = afterPartial * 1_000n;
  console.log(
    `\n3. over-withdrawing ${ethers.formatUnits(absurd, 6)} ${confidentialSymbol} (1000x what remains)`,
  );
  const clampTx = await withdraw(absurd);
  console.log(`   ${clampTx.hash}  gas ${clampTx.gasUsed}`);

  const afterClamp = await reveal();
  console.log(`   principal now: ${ethers.formatUnits(afterClamp, 6)} ${confidentialSymbol}`);
  console.log(`   clamped to the balance rather than reverting: ${afterClamp === 0n}`);
  if (afterClamp !== 0n) throw new Error(`expected 0 after full exit, got ${afterClamp}`);

  // ---------------------------------------------------------------------------------------------
  // 4. Leaving confidential form entirely: unwrap the confidential balance the pool sent back, then
  //    finalize it into plain, public USDC in the saver's own wallet.
  // ---------------------------------------------------------------------------------------------
  const wrappedBalance = await revealWrapped();
  console.log(
    `\n4. confidential (wrapper) balance now held: ${ethers.formatUnits(wrappedBalance, 6)} ${confidentialSymbol}`,
  );
  if (wrappedBalance === 0n) throw new Error("nothing to unwrap");

  const underlyingBefore = await underlying.balanceOf(saver.address);
  console.log(
    `   public USDC balance before unwrap: ${ethers.formatUnits(underlyingBefore, 6)} ${underlyingSymbol}`,
  );

  const unwrapInput = await withRelayerRetry(
    () => fhevm.createEncryptedInput(tokenAddress, saver.address).add64(wrappedBalance).encrypt(),
    { label: "encrypt unwrap amount", log: (m) => console.log(m) },
  );
  const unwrapTx = await token
    .connect(saver)
    ["unwrap(address,address,bytes32,bytes)"](
      saver.address,
      saver.address,
      unwrapInput.handles[0]!,
      unwrapInput.inputProof,
    );
  const unwrapReceipt = await unwrapTx.wait();
  console.log(`\n5. unwrap requested   ${unwrapTx.hash}  gas ${unwrapReceipt?.gasUsed}`);

  const unwrapRequestedTopic = token.interface.getEvent("UnwrapRequested")!.topicHash;
  const requestLog = unwrapReceipt!.logs.find((log) => log.topics[0] === unwrapRequestedTopic);
  if (!requestLog) throw new Error("no UnwrapRequested event in the unwrap transaction");
  const parsed = token.interface.decodeEventLog(
    "UnwrapRequested",
    requestLog.data,
    requestLog.topics,
  );
  const unwrapRequestId = parsed.unwrapRequestId as string;
  console.log(`   request id ${unwrapRequestId}`);

  const unwrapAmountHandle = await token.unwrapAmount(unwrapRequestId);
  const { value: unwrapAmountClear, proof: unwrapProof } =
    await publicDecryptNumber(unwrapAmountHandle);
  console.log(
    `   KMS-decrypted amount: ${ethers.formatUnits(unwrapAmountClear, 6)} ${underlyingSymbol}`,
  );

  const finalizeTx = await token
    .connect(saver)
    .finalizeUnwrap(unwrapRequestId, unwrapAmountClear, unwrapProof);
  const finalizeReceipt = await finalizeTx.wait();
  console.log(`\n6. unwrap finalized   ${finalizeTx.hash}  gas ${finalizeReceipt?.gasUsed}`);

  const underlyingAfter = await underlying.balanceOf(saver.address);
  console.log(
    `   public USDC balance after unwrap:  ${ethers.formatUnits(underlyingAfter, 6)} ${underlyingSymbol}`,
  );
  const unwrapExact = underlyingAfter - underlyingBefore === unwrapAmountClear;
  console.log(`   received exactly the unwrapped amount: ${unwrapExact}`);
  if (!unwrapExact) {
    throw new Error(
      `expected public balance to increase by ${unwrapAmountClear}, ` +
        `it increased by ${underlyingAfter - underlyingBefore}`,
    );
  }

  const evidence = {
    network: manifest.network,
    chainId,
    commit: manifest.commit,
    recordedAt: new Date().toISOString(),
    saver: saver.address,
    pool: poolAddress,
    confidentialToken: tokenAddress,
    underlyingToken: underlyingAddress,
    openingPrincipalUnits: opening.toString(),
    partialWithdrawal: {
      requestedUnits: partial.toString(),
      txHash: partialTx.hash,
      gasUsed: partialTx.gasUsed,
      principalAfterUnits: afterPartial.toString(),
      exact: partialExact,
    },
    overWithdrawal: {
      requestedUnits: absurd.toString(),
      txHash: clampTx.hash,
      gasUsed: clampTx.gasUsed,
      principalAfterUnits: afterClamp.toString(),
      clampedNotReverted: true,
      note: "Asking for 1000x the remaining balance succeeded and took exactly the balance. A revert here would let anyone probe a private balance by observing which amounts fail.",
    },
    unwrap: {
      requestTxHash: unwrapTx.hash,
      unwrapRequestId,
      finalizeTxHash: finalizeTx.hash,
      unwrappedUnits: unwrapAmountClear.toString(),
      underlyingBalanceBeforeUnits: underlyingBefore.toString(),
      underlyingBalanceAfterUnits: underlyingAfter.toString(),
      exact: unwrapExact,
      note:
        "Withdrawal from the pool returns the confidential wrapper token, not plain ERC-20 — leaving " +
        "confidential form entirely is the wrapper's own async unwrap: unwrap() requests it (the " +
        "wrapper itself marks the amount publicly decryptable), then finalizeUnwrap() carries a " +
        "KMS-signed cleartext to complete the ERC-20 transfer. Both steps run here, and the saver's " +
        "public balance increases by exactly the unwrapped amount.",
    },
  };

  const target = resolve(__dirname, "../../..", "evidence/live/withdrawal.json");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`\nWrote evidence/live/withdrawal.json`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
