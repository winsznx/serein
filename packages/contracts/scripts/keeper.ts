import { ethers } from "hardhat";

import { runDrawCycle, DRAW_STATUS_NAMES } from "./lib/draw-runner";
import { addressOf, loadManifest } from "./lib/manifest";
import type { SereinPool } from "../types";

/**
 * The keeper: a loop that keeps draws punctual.
 *
 * It holds no authority. Every function it calls is callable by anyone, its key cannot move
 * principal, cannot influence who wins, and cannot decrypt anything private. If this process dies,
 * draws stop being punctual and nothing else happens — savers keep depositing, keep withdrawing, and
 * anyone can finish an in-flight draw from a browser.
 *
 * Run once with `--once`, or as a loop with `SEREIN_KEEPER_INTERVAL` seconds between passes.
 */

const INTERVAL_SECONDS = Number(process.env.SEREIN_KEEPER_INTERVAL ?? 60);
const BATCH_SIZE = Number(process.env.SEREIN_BATCH_SIZE ?? 5);
const RUN_ONCE = process.argv.includes("--once") || process.env.SEREIN_KEEPER_ONCE === "1";

async function main(): Promise<void> {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const manifest = loadManifest(chainId);
  const poolAddress = addressOf(manifest, "SereinPool");

  const signers = await ethers.getSigners();
  // Prefer the dedicated keeper key when one is configured, so the deployer's key is not exercised
  // by routine automation.
  const signer = signers[1] ?? signers[0];
  if (!signer) throw new Error("no signer available");

  const pool = (await ethers.getContractAt("SereinPool", poolAddress)) as unknown as SereinPool;

  console.log(`Serein keeper`);
  console.log(`  chain    ${manifest.network} (${chainId})`);
  console.log(`  pool     ${poolAddress}`);
  console.log(`  keeper   ${await signer.getAddress()}`);
  console.log(`  balance  ${ethers.formatEther(await ethers.provider.getBalance(signer))} ETH`);
  console.log(`  batch    ${BATCH_SIZE}`);
  console.log(`  mode     ${RUN_ONCE ? "once" : `loop every ${INTERVAL_SECONDS}s`}\n`);

  for (;;) {
    try {
      const drawId = await pool.currentDrawId();
      const draw = await pool.getDraw(drawId);
      const now = Math.floor(Date.now() / 1000);
      const remaining = Number(draw.endTimestamp) - now;
      console.log(
        `[${new Date().toISOString()}] draw #${drawId} ` +
          `${DRAW_STATUS_NAMES[Number(draw.status)]} ` +
          `participants=${draw.participantCount} ` +
          `${remaining > 0 ? `ends in ${remaining}s` : "due"}`,
      );

      const result = await runDrawCycle(pool, signer, {
        batchSize: BATCH_SIZE,
        log: (message) => console.log(message),
      });

      if (result) {
        const finished = await pool.getDraw(result.drawId);
        console.log(
          `  draw #${result.drawId} -> ${DRAW_STATUS_NAMES[Number(finished.status)]}` +
            (result.rejections > 0 ? ` (${result.rejections} rejected candidates)` : ""),
        );
      }
    } catch (error) {
      // A keeper that exits on the first RPC hiccup is worse than no keeper. Draw state is on chain
      // and every step is idempotent, so the right response to a failure is to try again shortly.
      console.error(`  keeper pass failed: ${String(error)}`);
    }

    if (RUN_ONCE) return;
    await new Promise((done) => setTimeout(done, INTERVAL_SECONDS * 1000));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
