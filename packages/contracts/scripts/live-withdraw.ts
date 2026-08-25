import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm } from "hardhat";

import { addressOf, loadManifest } from "./lib/manifest";
import { withRelayerRetry, initFhevm } from "./lib/relayer";
import type { SereinPool } from "../types";

/**
 * Demonstrate withdrawal on live Sepolia, including the two properties that are easy to claim and
 * hard to prove:
 *
 *   1. principal comes out for exactly the amount asked, encrypted end to end;
 *   2. over-withdrawing is clamped rather than reverted, so a failed transaction can never be used
 *      as an oracle against a balance the protocol is supposed to keep private.
 *
 * The second is the interesting one. Reverting on "amount exceeds balance" would let anyone
 * binary-search someone else's balance by watching which withdrawals succeed. Serein takes whatever
 * is actually there instead, which is why the final step here asks for far more than the account
 * holds and expects to end at exactly zero.
 */
async function main(): Promise<void> {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const manifest = loadManifest(chainId);
  await initFhevm(fhevm);

  const signers = await ethers.getSigners();
  const saver = signers[2];
  if (!saver) throw new Error("need a participant signer");

  const poolAddress = addressOf(manifest, "SereinPool");
  const pool = (await ethers.getContractAt("SereinPool", poolAddress)) as unknown as SereinPool;

  const reveal = async (): Promise<bigint> => {
    const handle = await pool.confidentialBalanceOf(saver.address);
    if (handle === ethers.ZeroHash) return 0n;
    return withRelayerRetry(
      () => fhevm.userDecryptEuint(FhevmType.euint64, handle, poolAddress, saver),
      { label: "reveal principal", log: (m) => console.log(m) },
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
  console.log(`1. opening principal: ${ethers.formatUnits(opening, 6)} ptUSDC`);
  if (opening === 0n) throw new Error("nothing to withdraw");

  const partial = opening / 4n;
  console.log(`\n2. withdrawing ${ethers.formatUnits(partial, 6)} ptUSDC (a quarter)`);
  const partialTx = await withdraw(partial);
  console.log(`   ${partialTx.hash}  gas ${partialTx.gasUsed}`);

  const afterPartial = await reveal();
  console.log(`   principal now: ${ethers.formatUnits(afterPartial, 6)} ptUSDC`);
  const partialExact = afterPartial === opening - partial;
  console.log(`   exact: ${partialExact}`);
  if (!partialExact) {
    throw new Error(`expected ${opening - partial}, got ${afterPartial}`);
  }

  // Ask for far more than remains. A reverting contract would leak the balance through the failure;
  // this one takes exactly what is there.
  const absurd = afterPartial * 1_000n;
  console.log(`\n3. over-withdrawing ${ethers.formatUnits(absurd, 6)} ptUSDC (1000x what remains)`);
  const clampTx = await withdraw(absurd);
  console.log(`   ${clampTx.hash}  gas ${clampTx.gasUsed}`);

  const afterClamp = await reveal();
  console.log(`   principal now: ${ethers.formatUnits(afterClamp, 6)} ptUSDC`);
  console.log(`   clamped to the balance rather than reverting: ${afterClamp === 0n}`);
  if (afterClamp !== 0n) throw new Error(`expected 0 after full exit, got ${afterClamp}`);

  const evidence = {
    network: manifest.network,
    chainId,
    commit: manifest.commit,
    recordedAt: new Date().toISOString(),
    saver: saver.address,
    pool: poolAddress,
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
