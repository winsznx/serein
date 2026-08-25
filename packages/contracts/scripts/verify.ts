import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { ethers, run } from "hardhat";

import { addressOf, loadManifest } from "./lib/manifest";

/**
 * Publish contract source for every deployed contract.
 *
 * Verification is not decoration. Serein's claims are about what the code does, and a reader who
 * cannot see the source at the deployed address has to take those claims on faith.
 *
 * This talks to Sourcify's v2 API directly rather than through `hardhat-verify`. The plugin still
 * posts to the legacy `/verify` endpoint, which now returns a 404 HTML page — the resulting
 * "Unexpected token '<'" is the plugin trying to parse that page as JSON. Sourcify needs no API key,
 * which is the point: source verification cannot be blocked on a credential the project may not
 * have. Etherscan runs as well when `ETHERSCAN_API_KEY` is set.
 */

const SOURCIFY = "https://sourcify.dev/server";

interface BuildInfo {
  solcLongVersion: string;
  input: unknown;
  output: { contracts: Record<string, Record<string, unknown>> };
}

/** Find the build-info that actually compiled a given source file. */
function buildInfoFor(sourceName: string): BuildInfo {
  const dir = resolve(__dirname, "../artifacts/build-info");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const info = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as BuildInfo;
    if (info.output?.contracts?.[sourceName]) return info;
  }
  throw new Error(
    `no build-info contains ${sourceName}. Run \`pnpm --filter @serein/contracts compile\` first.`,
  );
}

async function verifyOnSourcify(
  chainId: number,
  address: string,
  sourceName: string,
  contractName: string,
): Promise<string> {
  const existing = await fetch(`${SOURCIFY}/v2/contract/${chainId}/${address}`);
  if (existing.ok) {
    const body = (await existing.json()) as { match?: string | null };
    if (body.match) return `already verified (${body.match} match)`;
  }

  const info = buildInfoFor(sourceName);
  const response = await fetch(`${SOURCIFY}/v2/verify/${chainId}/${address}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stdJsonInput: info.input,
      compilerVersion: info.solcLongVersion,
      contractIdentifier: `${sourceName}:${contractName}`,
    }),
  });

  const payload = (await response.json()) as { verificationId?: string; message?: string };
  if (!response.ok || !payload.verificationId) {
    throw new Error(payload.message ?? `Sourcify returned ${response.status}`);
  }

  // Verification is asynchronous; poll until it settles rather than reporting a job id as success.
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((done) => setTimeout(done, 2_000));
    const jobResponse = await fetch(`${SOURCIFY}/v2/verify/${payload.verificationId}`);
    const job = (await jobResponse.json()) as {
      isJobCompleted?: boolean;
      contract?: { match?: string | null };
      error?: { message?: string; customCode?: string };
    };
    if (!job.isJobCompleted) continue;
    if (job.error)
      throw new Error(job.error.message ?? job.error.customCode ?? "verification failed");
    return `verified (${job.contract?.match ?? "match"})`;
  }

  throw new Error("Sourcify did not finish the verification job in time");
}

async function main(): Promise<void> {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const manifest = loadManifest(chainId);

  const targets = [
    { name: "TestUSDC", source: "contracts/tokens/TestUSDC.sol", args: [] as unknown[] },
    {
      name: "ConfidentialUSDC",
      source: "contracts/tokens/ConfidentialUSDC.sol",
      args: [
        addressOf(manifest, "TestUSDC"),
        process.env.SEREIN_TOKEN_URI ?? "https://serein.pages.dev/tokens/ptusdc.json",
      ],
    },
    {
      name: "SereinPrizeReserve",
      source: "contracts/SereinPrizeReserve.sol",
      args: [addressOf(manifest, "ConfidentialUSDC"), manifest.deployer],
    },
    {
      name: "SereinPool",
      source: "contracts/SereinPool.sol",
      args: [
        addressOf(manifest, "ConfidentialUSDC"),
        addressOf(manifest, "SereinPrizeReserve"),
        manifest.drawDurationSeconds,
      ],
    },
    {
      name: "MockPrizeSource",
      source: "contracts/MockPrizeSource.sol",
      args: [
        addressOf(manifest, "ConfidentialUSDC"),
        addressOf(manifest, "SereinPrizeReserve"),
        manifest.deployer,
      ],
    },
  ];

  console.log(`Verifying ${targets.length} contracts on chain ${chainId}\n`);

  for (const target of targets) {
    const address = addressOf(manifest, target.name);
    process.stdout.write(`${target.name.padEnd(20)} ${address}  `);
    try {
      const outcome = await verifyOnSourcify(chainId, address, target.source, target.name);
      console.log(`Sourcify: ${outcome}`);
    } catch (error) {
      console.log(`Sourcify FAILED — ${(error as Error).message.split("\n")[0]}`);
    }

    if (process.env.ETHERSCAN_API_KEY) {
      try {
        await run("verify:etherscan", { address, constructorArguments: target.args });
        console.log(`${" ".repeat(20)} ${" ".repeat(42)}  Etherscan: verified`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const already = /already verified|already been verified/i.test(detail);
        console.log(
          `${" ".repeat(20)} ${" ".repeat(42)}  Etherscan: ${already ? "already verified" : detail.split("\n")[0]}`,
        );
      }
    }
  }

  console.log(`\nBrowse verified source at https://repo.sourcify.dev/${chainId}/<address>`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
