import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { ethers, network } from "hardhat";

/**
 * Deploy Serein against Zama's registered cUSDCMock, instead of a Serein-owned confidential token.
 *
 * Serein's contracts were already written against generic `IERC7984`/`IERC7984ERC20Wrapper` — nothing
 * in `SereinPool`, `SereinPrizeReserve`, or `MockPrizeSource` assumes the wrapper is one Serein deployed
 * itself. The original `deploy.ts` deployed a Serein-owned `TestUSDC`/`ConfidentialUSDC` pair anyway,
 * which meant an auditor reviewing "what does Serein depend on" had two extra contracts to read that
 * add no product behavior. This script removes them from the canonical path: it resolves Zama's
 * official mock USDC and its registered confidential wrapper through the on-chain
 * ConfidentialTokenWrappersRegistry, verifies the pair rather than trusting a hardcoded address, and
 * deploys the Serein stack directly on top of it.
 *
 * The registry lookup is the actual safety property here. A hardcoded wrapper address is one bad
 * paste away from pointing Serein at a revoked or unrelated contract; asking the registry and checking
 * `isValid` means a redeploy against a revoked wrapper fails loudly at deploy time instead of silently
 * shipping.
 *
 * `TestUSDC.sol`/`ConfidentialUSDC.sol` are not deleted — `deploy.ts` and the local Hardhat/mock-FHEVM
 * test suite still need them, since there is no real Zama registry on a local network to resolve
 * against. They move from "what the live app runs on" to "test fixtures," which is exactly what they
 * always functionally were.
 */

// Zama's official Sepolia addresses (docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia),
// confirmed live against the deployed contracts before this script was written: the registry resolves
// USDC_MOCK to CUSDC_MOCK with isValid=true, CUSDC_MOCK.underlying() returns USDC_MOCK, and
// CUSDC_MOCK.supportsInterface(type(IERC7984).interfaceId) returns true.
const REGISTRY_ADDRESS =
  process.env.SEREIN_ZAMA_REGISTRY ?? "0x2f0750Bbb0A246059d80e94c454586a7F27a128e";
const USDC_MOCK_ADDRESS =
  process.env.SEREIN_ZAMA_USDC_MOCK ?? "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF";
const EXPECTED_CUSDC_MOCK =
  process.env.SEREIN_ZAMA_CUSDC_MOCK ?? "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639";

const DRAW_DURATION_SECONDS = BigInt(process.env.SEREIN_DRAW_DURATION ?? 900);

const REGISTRY_ABI = [
  "function getConfidentialTokenAddress(address token) view returns (bool isValid, address confidentialToken)",
];
const IERC7984_INTERFACE_ID = "0x4958f2a4";

interface ManifestContract {
  address: string;
  deployedAtBlock: number;
  txHash: string;
  contractName?: string;
}

interface Manifest {
  network: string;
  chainId: number;
  commit: string;
  deployedAt: string;
  deployer: string;
  drawDurationSeconds: string;
  tokenSource: string;
  contracts: Record<string, ManifestContract>;
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

  // ---- Resolve and verify the canonical pair. Do not trust the hardcoded address alone. ---------
  console.log("Resolving Zama's canonical USDC pair through the wrappers registry...");
  const registry = new ethers.Contract(
    REGISTRY_ADDRESS,
    REGISTRY_ABI,
    ethers.provider,
  ) as unknown as {
    getConfidentialTokenAddress(token: string): Promise<[boolean, string]>;
  };
  const [isValid, resolvedWrapper] = await registry.getConfidentialTokenAddress(USDC_MOCK_ADDRESS);

  if (!isValid) {
    throw new Error(
      `registry reports USDC mock ${USDC_MOCK_ADDRESS} has no valid confidential wrapper ` +
        `(resolved ${resolvedWrapper}) — it may have been revoked since this script was written`,
    );
  }
  if (resolvedWrapper.toLowerCase() !== EXPECTED_CUSDC_MOCK.toLowerCase()) {
    throw new Error(
      `registry resolved ${resolvedWrapper}, expected ${EXPECTED_CUSDC_MOCK} — Zama's registered ` +
        `wrapper for this token has changed; update SEREIN_ZAMA_CUSDC_MOCK rather than proceeding blind`,
    );
  }
  console.log(`  registry confirms  ${USDC_MOCK_ADDRESS} -> ${resolvedWrapper} (valid)`);

  const cUSDCMock = new ethers.Contract(
    resolvedWrapper,
    [
      "function underlying() view returns (address)",
      "function supportsInterface(bytes4) view returns (bool)",
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)",
    ],
    ethers.provider,
  ) as unknown as {
    underlying(): Promise<string>;
    supportsInterface(interfaceId: string): Promise<boolean>;
    decimals(): Promise<number>;
    symbol(): Promise<string>;
  };
  const [underlyingAddress, supportsERC7984, decimals, symbol] = await Promise.all([
    cUSDCMock.underlying(),
    cUSDCMock.supportsInterface(IERC7984_INTERFACE_ID),
    cUSDCMock.decimals(),
    cUSDCMock.symbol(),
  ]);
  if (underlyingAddress.toLowerCase() !== USDC_MOCK_ADDRESS.toLowerCase()) {
    throw new Error(
      `wrapper's own underlying() is ${underlyingAddress}, not the USDC mock ${USDC_MOCK_ADDRESS} — ` +
        `the registry and the wrapper disagree, which should never happen`,
    );
  }
  if (!supportsERC7984) {
    throw new Error(`${resolvedWrapper} does not report IERC7984 support via ERC-165`);
  }
  console.log(`  wrapper confirms   underlying() = ${underlyingAddress}`);
  console.log(`  wrapper is         ${symbol}, ${decimals} decimals, IERC7984-compliant\n`);

  // ---- Deploy the Serein stack directly on the verified wrapper. ---------------------------------
  const contracts: Manifest["contracts"] = {};

  const record = async (
    name: string,
    contractName: string,
    contract: { getAddress(): Promise<string>; deploymentTransaction(): { hash: string } | null },
  ): Promise<string> => {
    const address = await contract.getAddress();
    const tx = contract.deploymentTransaction();
    const receipt = tx ? await ethers.provider.getTransactionReceipt(tx.hash) : null;
    contracts[name] = {
      address,
      deployedAtBlock: receipt?.blockNumber ?? 0,
      txHash: tx?.hash ?? "",
      contractName,
    };
    console.log(`${name.padEnd(20)} ${address}  (${contractName})`);
    return address;
  };

  // Recorded under the same role-name keys ("TestUSDC", "ConfidentialUSDC") every existing script and
  // the frontend already reads by name — `contractName` above is what disambiguates that these slots
  // now hold Zama's official contracts rather than ones Serein deployed.
  contracts.TestUSDC = {
    address: USDC_MOCK_ADDRESS,
    deployedAtBlock: 0,
    txHash: "",
    contractName: "Zama USDCMock (external, not deployed by this script)",
  };
  console.log(`${"TestUSDC".padEnd(20)} ${USDC_MOCK_ADDRESS}  (Zama USDCMock, external)`);
  contracts.ConfidentialUSDC = {
    address: resolvedWrapper,
    deployedAtBlock: 0,
    txHash: "",
    contractName: "Zama cUSDCMock (external, not deployed by this script)",
  };
  console.log(`${"ConfidentialUSDC".padEnd(20)} ${resolvedWrapper}  (Zama cUSDCMock, external)`);

  const reserve = await (
    await ethers.getContractFactory("SereinPrizeReserve")
  ).deploy(resolvedWrapper, deployer.address);
  await reserve.waitForDeployment();
  const reserveAddress = await record("SereinPrizeReserve", "SereinPrizeReserve", reserve);

  const pool = await (
    await ethers.getContractFactory("SereinPool")
  ).deploy(resolvedWrapper, reserveAddress, DRAW_DURATION_SECONDS);
  await pool.waitForDeployment();
  const poolAddress = await record("SereinPool", "SereinPool", pool);

  const prizeSource = await (
    await ethers.getContractFactory("MockPrizeSource")
  ).deploy(resolvedWrapper, reserveAddress, deployer.address);
  await prizeSource.waitForDeployment();
  const prizeSourceAddress = await record("MockPrizeSource", "MockPrizeSource", prizeSource);

  console.log("\nBinding reserve to pool and prize source...");
  const initTx = await reserve.initialize(poolAddress, prizeSourceAddress);
  await initTx.wait();
  console.log(`  ${initTx.hash}`);

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
    tokenSource: "zama-canonical",
    contracts,
  };

  const root = resolve(__dirname, "../../..");
  const canonicalPath = resolve(root, `deployments/${chainId}.json`);

  // Preserve the previous (Serein-owned-token) deployment as historical evidence before overwriting
  // the canonical manifest — the six draws already run against it stay reproducible from their own
  // recorded addresses even after the live app switches to the Zama-canonical instance.
  if (existsSync(canonicalPath)) {
    const legacyDir = resolve(root, "deployments/legacy");
    mkdirSync(legacyDir, { recursive: true });
    const legacyPath = resolve(legacyDir, `${chainId}-custom-token.json`);
    if (!existsSync(legacyPath)) {
      copyFileSync(canonicalPath, legacyPath);
      console.log(`\nPreserved previous manifest at ${legacyPath.replace(root, ".")}`);
    }
  }

  for (const target of [
    canonicalPath,
    resolve(root, `evidence/deployments/${network.name}-${chainId}-canonical.json`),
  ]) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote ${target.replace(root, ".")}`);
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
