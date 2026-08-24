/**
 * Generates the committed proof artifacts under `evidence/`.
 *
 * Two products come out of this:
 *
 *   1. a deterministic scenario corpus with its per-scenario results, which the
 *      FHE mock suite replays so a mismatch between the plaintext model and the
 *      encrypted implementation shows up as a failing test rather than a claim;
 *   2. a statistical fairness campaign that samples fixed weight vectors many
 *      times and reports observed frequencies against theory with Wilson score
 *      intervals.
 *
 * The statistical campaign is a supplement. The proof that selection is exact is
 * the conditional-uniformity argument in ARCHITECTURE.md plus the per-scenario
 * invariant checks, not the frequency table.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { Prng } from "../src/prng.js";
import { generateCorpus, simulateScenario } from "../src/scenario.js";
import { runWeightedDraw } from "../src/weighted.js";

// Run through `pnpm proof:local`, which sets the working directory to this package. Kept relative
// to cwd rather than to the module URL so the file compiles the same under both CommonJS and ESM.
const EVIDENCE = process.env.SEREIN_EVIDENCE_DIR ?? resolve(process.cwd(), "../../evidence");

const CORPUS_SIZE = Number(process.env.SEREIN_CORPUS_SIZE ?? 10_000);
const FAIRNESS_SAMPLES = Number(process.env.SEREIN_FAIRNESS_SAMPLES ?? 200_000);

const json = (value: unknown): string =>
  JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);

function writeArtifact(relativePath: string, contents: string): void {
  const target = resolve(EVIDENCE, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
  console.log(`  wrote evidence/${relativePath}`);
}

/** Wilson score interval — well behaved at extreme p and small n, unlike normal approximation. */
function wilsonInterval(successes: number, trials: number, z = 3.890592): [number, number] {
  if (trials === 0) return [0, 0];
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = p + (z * z) / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  // At p = 0 the two terms are algebraically equal and the lower bound is
  // exactly 0; in floating point they differ by ~1e-20. Snap the exact endpoints
  // rather than carrying that residue into a containment test.
  const low = successes === 0 ? 0 : Math.max(0, (centre - spread) / denominator);
  const high = successes === trials ? 1 : Math.min(1, (centre + spread) / denominator);
  return [low, high];
}

function buildScenarioCorpus(): void {
  console.log(`Simulating ${CORPUS_SIZE} deterministic scenarios...`);
  const corpus = generateCorpus(CORPUS_SIZE);
  const results = corpus.map(simulateScenario);

  const shapeCounts = new Map<string, number>();
  let totalAttempts = 0;
  let multiAttemptDraws = 0;
  let zeroWeightDraws = 0;
  let clampedWithdrawals = 0;

  const records = results.map((result) => {
    shapeCounts.set(result.scenario.shape, (shapeCounts.get(result.scenario.shape) ?? 0) + 1);
    totalAttempts += result.selection.attempts.length;
    if (result.selection.attempts.length > 1) multiAttemptDraws += 1;
    if (result.selection.total === 0n) zeroWeightDraws += 1;
    clampedWithdrawals += result.applied.filter(
      (a) => a.kind === "withdraw" && a.effectiveAmount < a.amount,
    ).length;

    return {
      id: result.scenario.id,
      shape: result.scenario.shape,
      participantCount: result.scenario.participantCount,
      epochStart: result.scenario.epochStart,
      epochEnd: result.scenario.epochEnd,
      weights: result.weights,
      aggregateWeight: result.aggregateWeight,
      bound: result.selection.bound,
      attempts: result.selection.attempts.map((a) => ({
        candidate: a.candidate,
        accepted: a.accepted,
      })),
      randomTarget: result.selection.randomTarget,
      winnerIndex: result.selection.winnerIndex,
      finalPrefix: result.selection.finalPrefix,
      prize: result.scenario.prize,
      prizeCredits: result.prizeCredits,
      weightsUnchangedAfterPostClose:
        json(result.weights) === json(result.weightsAfterPostClose),
    };
  });

  writeArtifact(
    "raw/scenario-corpus.json",
    json({
      generatedBy: "packages/reference-model/scripts/generate-proof-corpus.ts",
      note: "Deterministic scenarios, not users. Reproduce with `pnpm proof:local`.",
      corpusSize: CORPUS_SIZE,
      summary: {
        shapes: Object.fromEntries([...shapeCounts].sort()),
        meanAttemptsPerDraw: totalAttempts / Math.max(1, CORPUS_SIZE - zeroWeightDraws),
        multiAttemptDraws,
        zeroWeightDraws,
        clampedWithdrawals,
      },
      scenarios: records,
    }),
  );
}

function buildFairnessCampaign(): void {
  const vectors: { label: string; weights: bigint[] }[] = [
    { label: "1:1", weights: [1n, 1n] },
    { label: "1:2", weights: [1n, 2n] },
    { label: "1:2:7", weights: [1n, 2n, 7n] },
    { label: "uniform-6", weights: Array.from({ length: 6 }, () => 1n) },
    { label: "whale-97:3", weights: [97n, 3n] },
    { label: "with-zero-weights", weights: [1n, 0n, 4n, 0n, 5n] },
    { label: "power-of-two-total", weights: [3n, 5n, 8n] },
    {
      label: "large-realistic",
      weights: [3_600_000_000n, 1_800_000_000n, 900_000_000n, 450_000_000n],
    },
  ];

  console.log(`Running fairness campaign at ${FAIRNESS_SAMPLES} samples per vector...`);
  const report = vectors.map(({ label, weights }) => {
    const total = weights.reduce((a, b) => a + b, 0n);
    const prng = new Prng(`fairness-campaign/${label}`);
    const wins = new Array<number>(weights.length).fill(0);
    let attempts = 0;

    for (let i = 0; i < FAIRNESS_SAMPLES; i++) {
      const result = runWeightedDraw(weights, (bound) => prng.nextBelow(bound));
      wins[result.winnerIndex]! += 1;
      attempts += result.attempts.length;
    }

    const participants = weights.map((weight, index) => {
      const expected = Number(weight) / Number(total);
      const observed = wins[index]! / FAIRNESS_SAMPLES;
      const [low, high] = wilsonInterval(wins[index]!, FAIRNESS_SAMPLES);
      // A zero-weight participant owns an empty prefix interval, so exclusion is
      // a structural property of the algorithm rather than a frequency estimate.
      // Asserting `wins === 0` is the honest check; a confidence interval would
      // imply the outcome were merely improbable.
      const structurallyExcluded = weight === 0n;
      return {
        index,
        weight,
        expectedProbability: expected,
        observedProbability: observed,
        wins: wins[index]!,
        structurallyExcluded,
        wilson99_99: structurallyExcluded ? null : ([low, high] as [number, number]),
        expectedInsideInterval: structurallyExcluded
          ? wins[index]! === 0
          : expected >= low && expected <= high,
      };
    });

    return {
      label,
      weights,
      total,
      samples: FAIRNESS_SAMPLES,
      meanAttemptsPerDraw: attempts / FAIRNESS_SAMPLES,
      participants,
      allExpectedInsideInterval: participants.every((p) => p.expectedInsideInterval),
    };
  });

  const failures = report.filter((r) => !r.allExpectedInsideInterval);

  writeArtifact(
    "benchmarks/statistical-fairness.json",
    json({
      generatedBy: "packages/reference-model/scripts/generate-proof-corpus.ts",
      method:
        "Per weight vector, run the full rejection-sampling + prefix-interval algorithm N times and compare observed winner frequency with W_i / T. Intervals are Wilson score at z = 3.890592 (99.99%).",
      caveat:
        "This supplements the exactness proof in ARCHITECTURE.md; it is not the proof. Randomness here is a seeded splitmix64 test fixture, not the onchain CSPRNG.",
      samplesPerVector: FAIRNESS_SAMPLES,
      vectors: report,
      vectorsOutsideInterval: failures.map((f) => f.label),
    }),
  );

  for (const vector of report) {
    const status = vector.allExpectedInsideInterval ? "ok" : "OUT OF INTERVAL";
    console.log(
      `  ${vector.label.padEnd(22)} mean attempts ${vector.meanAttemptsPerDraw.toFixed(4)}  ${status}`,
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `fairness campaign: expected probability fell outside the 99.99% interval for ${failures
        .map((f) => f.label)
        .join(", ")}`,
    );
  }
}

buildScenarioCorpus();
buildFairnessCampaign();
console.log("Proof corpus complete.");
