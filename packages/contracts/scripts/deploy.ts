import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { ethers, network } from "hardhat";

/**
 * Deploy the whole Serein stack and write one canonical manifest.
 *
 * Every address the app, the docs, the proof view and the live-proof scripts use comes from the file
 * this script writes. There is exactly one copy, it records the commit it was built from, and
 * nothing reads an address from anywhere else — which is what keeps a redeploy from leaving a stale
 * address behind in a README that nobody thought to update.
 */

const DRAW_DURATION_SECONDS = BigInt(process.env.SEREIN_DRAW_DURATION ?? 900); // 15 minutes
const TOKEN_URI = process.env.SEREIN_TOKEN_URI ?? "https://serein.pages.dev/tokens/ptusdc.json";

interface Manifest {
  network: string;
  chainId: number;
  commit: string;
  deployedAt: string;
  deployer: string;
  drawDurationSeconds: string;
  contracts: Record<string, { address: string; deployedAtBlock: number; txHash: string }>;
}

function currentCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("no signer available — is DEPLOYER_PRIVATE_KEY set?");

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`Network       ${network.name} (chainId ${chainId})`);
  console.log(`Deployer      ${deployer.address}`);
  console.log(`Balance       ${ethers.formatEther(balance)} ETH`);
  console.log(`Draw duration ${DRAW_DURATION_SECONDS}s\n`);

  if (balance === 0n) {
    throw new Error(`deployer ${deployer.address} has no ETH — fund it before deploying`);
  }

  const contracts: Manifest["contracts"] = {};

  const record = async (
    name: string,
    contract: { getAddress(): Promise<string>; deploymentTransaction(): { hash: string } | null },
  ): Promise<string> => {
    const address = await contract.getAddress();
    const tx = contract.deploymentTransaction();
    const receipt = tx ? await ethers.provider.getTransactionReceipt(tx.hash) : null;
    contracts[name] = {
      address,
      deployedAtBlock: receipt?.blockNumber ?? 0,
      txHash: tx?.hash ?? "",
    };
    console.log(`${name.padEnd(20)} ${address}`);
    return address;
  };

  const testUSDC = await (await ethers.getContractFactory("TestUSDC")).deploy();
  await testUSDC.waitForDeployment();
  const testUSDCAddress = await record("TestUSDC", testUSDC);

  const confidentialUSDC = await (
    await ethers.getContractFactory("ConfidentialUSDC")
  ).deploy(testUSDCAddress, TOKEN_URI);
  await confidentialUSDC.waitForDeployment();
  const confidentialUSDCAddress = await record("ConfidentialUSDC", confidentialUSDC);

  const reserve = await (
    await ethers.getContractFactory("SereinPrizeReserve")
  ).deploy(confidentialUSDCAddress, deployer.address);
  await reserve.waitForDeployment();
  const reserveAddress = await record("SereinPrizeReserve", reserve);

  const pool = await (
    await ethers.getContractFactory("SereinPool")
  ).deploy(confidentialUSDCAddress, reserveAddress, DRAW_DURATION_SECONDS);
  await pool.waitForDeployment();
  const poolAddress = await record("SereinPool", pool);

  const prizeSource = await (
    await ethers.getContractFactory("MockPrizeSource")
  ).deploy(confidentialUSDCAddress, reserveAddress, deployer.address);
  await prizeSource.waitForDeployment();
  const prizeSourceAddress = await record("MockPrizeSource", prizeSource);

  console.log("\nBinding reserve to pool and prize source...");
  const initTx = await reserve.initialize(poolAddress, prizeSourceAddress);
  await initTx.wait();
  console.log(`  ${initTx.hash}`);

  // The binding is single-shot, so verify it landed rather than assuming.
  const boundPool = await reserve.pool();
  const boundSource = await reserve.prizeSource();
  if (boundPool.toLowerCase() !== poolAddress.toLowerCase()) {
    throw new Error(`reserve bound to ${boundPool}, expected ${poolAddress}`);
  }
  if (boundSource.toLowerCase() !== prizeSourceAddress.toLowerCase()) {
    throw new Error(`reserve bound to source ${boundSource}, expected ${prizeSourceAddress}`);
  }

  const manifest: Manifest = {
    network: network.name,
    chainId,
    commit: currentCommit(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    drawDurationSeconds: DRAW_DURATION_SECONDS.toString(),
    contracts,
  };

  const root = resolve(__dirname, "../../..");
  for (const target of [
    resolve(root, `deployments/${chainId}.json`),
    resolve(root, `evidence/deployments/${network.name}-${chainId}.json`),
  ]) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`\nWrote ${target.replace(root, ".")}`);
  }

  const first = await pool.getDraw(await pool.currentDrawId());
  console.log(
    `\nDraw #${await pool.currentDrawId()} open, ends at ${new Date(
      Number(first.endTimestamp) * 1000,
    ).toISOString()}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
