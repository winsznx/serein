import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm } from "hardhat";

import { addressOf, loadManifest } from "./lib/manifest";
import { initFhevm } from "./lib/relayer";
import type { SereinPool } from "../types";

/**
 * Independently recompute a draw's published aggregate from public data.
 *
 * The contract proves internally that the sum of the encrypted individual weights equals the
 * published total — that is what the consistency check does. This script proves something different
 * and, for a sceptical reader, more useful: that the published number is what the *timestamps* say
 * it should be. It reads the observation series, integrates balance over the epoch in plain
 * arithmetic, and compares.
 *
 * Balances come from the mock debug decryptor when available. On a live network they are genuinely
 * unreadable — that is the point of the protocol — so the caller declares what they believe the
 * balance timeline was and the script checks it against the chain's own timestamps. A declaration
 * that does not reproduce the published total is either a wrong belief or a real discrepancy, and
 * either is worth knowing.
 *
 * The declaration is a series, one entry per observation, because a balance that changes mid-epoch
 * has no single value. `{"0xabc…": ["100000000", "75000000", "0"]}` says: held 100 from the first
 * observation, 75 from the second, nothing from the third. A single value is shorthand for a balance
 * that never changed.
 *
 * The integral is piecewise. A saver who changes balance mid-epoch contributes
 * `Σ balance_k × (t_{k+1} − t_k)` across their segments, not `balance_final × epoch`. Getting that
 * wrong is the easiest way to "disprove" a total that is in fact correct.
 *
 *   SEREIN_DRAW_ID=5 SEREIN_STAKES='{"0xabc…":100000000}' hardhat run scripts/verify-aggregate.ts --network sepolia
 */
async function main(): Promise<void> {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const manifest = loadManifest(chainId);
  await initFhevm(fhevm);

  const poolAddress = addressOf(manifest, "SereinPool");
  const pool = (await ethers.getContractAt("SereinPool", poolAddress)) as unknown as SereinPool;

  const drawId = BigInt(process.env.SEREIN_DRAW_ID ?? (await pool.currentDrawId()) - 1n);
  const draw = await pool.getDraw(drawId);
  const start = draw.startTimestamp;
  const end = draw.endTimestamp;

  console.log(`Draw #${drawId} on ${manifest.network}`);
  console.log(`  epoch      ${start} -> ${end}  (${end - start}s)`);
  console.log(`  published  ${draw.verifiedTotalWeight.toLocaleString()}`);
  console.log(`  frozen at  ${draw.participantCount} participants\n`);

  const declared: Record<string, string | string[]> = process.env.SEREIN_STAKES
    ? (JSON.parse(process.env.SEREIN_STAKES) as Record<string, string | string[]>)
    : {};
  const lookup = new Map(
    Object.entries(declared).map(([address, value]) => [
      address.toLowerCase(),
      (Array.isArray(value) ? value : [value]).map((entry) => BigInt(entry)),
    ]),
  );

  let total = 0n;

  for (let index = 0n; index < draw.participantCount; index++) {
    const participant = await pool.participantAt(index);
    const count = await pool.observationCount(participant);

    // Rebuild the balance timeline from the public timestamps.
    const points: { at: bigint; balance: bigint }[] = [];
    for (let i = 0n; i < count; i++) {
      const [at, balanceHandle] = await pool.observationAt(participant, i);
      let balance: bigint;
      if (fhevm.isMock) {
        balance = await fhevm.debugger.decryptEuint(FhevmType.euint64, balanceHandle);
      } else {
        // Live: the balance is genuinely unreadable, so use the declared series. Index i when the
        // caller gave a full timeline; the single value when they gave shorthand; -1 (unknown) when
        // they declared nothing, rather than guessing a number.
        const series = lookup.get(participant.toLowerCase());
        balance =
          series === undefined
            ? -1n
            : series.length === 1
              ? series[0]!
              : (series[Number(i)] ?? -1n);
      }
      points.push({ at, balance });
    }

    // Integrate over [start, end], clipping each segment to the epoch.
    let weight = 0n;
    let unknown = false;
    for (let i = 0; i < points.length; i++) {
      const from = points[i]!.at;
      const to = i + 1 < points.length ? points[i + 1]!.at : end;
      const lo = from > start ? from : start;
      const hi = to < end ? to : end;
      if (hi <= lo) continue;
      const balance = points[i]!.balance;
      if (balance < 0n) {
        unknown = true;
        continue;
      }
      weight += balance * (hi - lo);
    }

    total += weight;
    const label = `${participant.slice(0, 8)}…${participant.slice(-4)}`;
    console.log(
      `  [${index}] ${label}  observations ${String(count).padStart(2)}  ` +
        `weight ${unknown ? "UNKNOWN (no declared stake)" : weight.toLocaleString()}`,
    );
  }

  console.log(`\n  recomputed ${total.toLocaleString()}`);
  console.log(`  published  ${draw.verifiedTotalWeight.toLocaleString()}`);

  if (total === draw.verifiedTotalWeight) {
    console.log(`\n  MATCH — the published aggregate is exactly what the timestamps imply.`);
  } else {
    const delta = draw.verifiedTotalWeight - total;
    console.log(`\n  difference ${delta.toLocaleString()}`);
    console.log(
      `  Not necessarily a discrepancy: on a live network any participant without a declared stake ` +
        `contributes an unknown amount. Declare every stake through SEREIN_STAKES for an exact check.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
