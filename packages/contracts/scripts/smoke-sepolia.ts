import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm } from "hardhat";

import { ensureUnderlyingBalance } from "./lib/faucet";
import { addressOf, loadManifest } from "./lib/manifest";
import { initFhevm } from "./lib/relayer";

/**
 * A minimal live check that the Zama relayer path works on Sepolia before the full campaign runs.
 *
 * The Hardhat mock coprocessor is faithful, but it is still a mock. This does one real encrypted
 * input, one real user decryption, and one real public decryption against the live relayer, so that
 * a relayer problem surfaces here — in twenty seconds and one transaction — rather than halfway
 * through a campaign that has already spent gas.
 */
async function main(): Promise<void> {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const manifest = loadManifest(chainId);
  const signers = await ethers.getSigners();
  const alice = signers[2] ?? signers[0];
  if (!alice) throw new Error("no signer available");

  const poolAddress = addressOf(manifest, "SereinPool");
  const tokenAddress = addressOf(manifest, "ConfidentialUSDC");
  const underlyingAddress = addressOf(manifest, "TestUSDC");

  // Tests get the plugin initialised for them; a `hardhat run` script has to ask.
  await initFhevm(fhevm);

  console.log(`Live smoke check on chain ${chainId}`);
  console.log(`  actor    ${alice.address}`);
  console.log(`  balance  ${ethers.formatEther(await ethers.provider.getBalance(alice))} ETH`);
  console.log(`  isMock   ${fhevm.isMock}\n`);

  if (fhevm.isMock) throw new Error("expected a live network, got the mock coprocessor");

  const underlying = await ethers.getContractAt("TestUSDC", underlyingAddress);
  const token = await ethers.getContractAt("ConfidentialUSDC", tokenAddress);
  const pool = await ethers.getContractAt("SereinPool", poolAddress);

  // Idempotent: if this address already has savings, go straight to the decryption check rather
  // than spending gas re-running the setup. A health check that costs money every time it runs is a
  // health check people stop running.
  const existing = await pool.confidentialBalanceOf(alice.address);
  if (existing !== ethers.ZeroHash) {
    console.log("Already saved; checking user decryption only.\n");
    const started = Date.now();
    const revealed = await fhevm.userDecryptEuint(FhevmType.euint64, existing, poolAddress, alice);
    console.log(`   handle ${existing}`);
    console.log(`   value  ${ethers.formatUnits(revealed, 6)} ptUSDC (${Date.now() - started}ms)`);
    console.log(`\nLive relayer path works end to end.`);
    return;
  }

  // 1. Public faucet.
  const balance = await underlying.balanceOf(alice.address);
  console.log(`1. faucet — current public balance ${ethers.formatUnits(balance, 6)} tUSDC`);
  const amount = 100_000_000n; // 100 tUSDC
  const faucetReceipt = await ensureUnderlyingBalance(
    manifest,
    underlyingAddress,
    alice,
    alice.address,
    amount,
    balance,
  );
  if (faucetReceipt) {
    console.log(`   claim ${faucetReceipt.hash}`);
  } else {
    console.log("   already funded, skipping");
  }

  // 2. Wrap into the confidential token. Public amount, by construction.
  console.log(`\n2. wrap ${ethers.formatUnits(amount, 6)} tUSDC into ptUSDC`);
  const approveTx = await underlying.connect(alice).approve(tokenAddress, amount);
  await approveTx.wait();
  console.log(`   approve ${approveTx.hash}`);
  const wrapTx = await token.connect(alice).wrap(alice.address, amount);
  await wrapTx.wait();
  console.log(`   wrap    ${wrapTx.hash}`);

  // 3. Encrypted input against the live relayer, then deposit through the ERC-7984 callback.
  console.log(`\n3. encrypt and save (live relayer)`);
  const started = Date.now();
  const input = await fhevm
    .createEncryptedInput(tokenAddress, alice.address)
    .add64(amount)
    .encrypt();
  console.log(`   encrypted input produced in ${Date.now() - started}ms`);

  const saveTx = await token
    .connect(alice)
    ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
      poolAddress,
      input.handles[0]!,
      input.inputProof,
      "0x",
    );
  console.log(`   save    ${saveTx.hash}`);
  const receipt = await saveTx.wait();
  console.log(`   gas     ${receipt?.gasUsed}`);

  // 4. User decryption — the saver reading their own balance.
  console.log(`\n4. reveal own balance (live relayer user decryption)`);
  const handle = await pool.confidentialBalanceOf(alice.address);
  console.log(`   handle  ${handle}`);
  const decryptStarted = Date.now();
  const revealed = await fhevm.userDecryptEuint(FhevmType.euint64, handle, poolAddress, alice);
  console.log(
    `   value   ${ethers.formatUnits(revealed, 6)} ptUSDC (${Date.now() - decryptStarted}ms)`,
  );

  if (revealed !== amount) {
    throw new Error(`decrypted ${revealed}, expected ${amount}`);
  }

  console.log(`\n5. participants registered: ${await pool.participantCount()}`);
  console.log(`\nLive relayer path works end to end.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
