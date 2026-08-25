import { describe, expect, it } from "vitest";

import { MAX_DRAW_WEIGHT, MAX_TOTAL_PRINCIPAL } from "../src/bounds.js";
import { generateCorpus, simulateScenario, type SimulationResult } from "../src/scenario.js";
import { nextPowerOfTwo } from "../src/weighted.js";

/**
 * The wide-evidence corpus. Every scenario is checked against the invariant set
 * in PRD section 25 that is expressible without a chain. These are deterministic
 * scenarios, not users.
 */
const CORPUS_SIZE = Number(process.env.SEREIN_CORPUS_SIZE ?? 10_000);

function checkInvariants(result: SimulationResult): void {
  const { scenario, weights, aggregateWeight, selection } = result;

  // 10. The aggregate equals the sum of individual weights, and the encrypted
  //     prefix walk terminates exactly there.
  const summed = weights.reduce((a, b) => a + b, 0n);
  expect(aggregateWeight).toBe(summed);
  expect(selection.total).toBe(summed);
  expect(selection.finalPrefix).toBe(selection.total);

  // Bound proof: nothing in the corpus may exceed the ceilings the contracts
  // rely on for their FHE arithmetic to stay inside its types.
  expect(aggregateWeight).toBeLessThanOrEqual(MAX_DRAW_WEIGHT);
  for (const balance of result.balancesAtClose) {
    expect(balance).toBeLessThanOrEqual(MAX_TOTAL_PRINCIPAL);
  }

  if (selection.total === 0n) {
    // 12. With no weight anywhere there is no winner, and no candidate is drawn.
    expect(selection.winnerIndex).toBe(-1);
    expect(selection.attempts).toHaveLength(0);
    expect(result.prizeCredits.every((credit) => credit === 0n)).toBe(true);
    return;
  }

  // 6. The accepted target lies in [0, T).
  expect(selection.randomTarget).toBeGreaterThanOrEqual(0n);
  expect(selection.randomTarget).toBeLessThan(selection.total);

  // The bound is the public power of two derived from the verified total.
  expect(selection.bound).toBe(nextPowerOfTwo(selection.total));
  expect(selection.bound & (selection.bound - 1n)).toBe(0n);

  // 7. Only the final attempt is accepted; rejected candidates are discarded.
  const accepted = selection.attempts.filter((a) => a.accepted);
  expect(accepted).toHaveLength(1);
  expect(accepted[0]!.candidate).toBe(selection.randomTarget);
  expect(selection.attempts.at(-1)!.accepted).toBe(true);
  for (const attempt of selection.attempts.slice(0, -1)) {
    expect(attempt.accepted).toBe(false);
    expect(attempt.candidate).toBeGreaterThanOrEqual(selection.total);
    expect(attempt.candidate).toBeLessThan(selection.bound);
  }

  // 11 / 12. Exactly one positive-weight participant wins; zero weight cannot.
  expect(selection.winnerIndex).toBeGreaterThanOrEqual(0);
  expect(weights[selection.winnerIndex]!).toBeGreaterThan(0n);
  const winnerStart = selection.prefixes[selection.winnerIndex]!;
  const winnerEnd = winnerStart + weights[selection.winnerIndex]!;
  expect(selection.randomTarget).toBeGreaterThanOrEqual(winnerStart);
  expect(selection.randomTarget).toBeLessThan(winnerEnd);

  // 8 / 9. The prefix walk is monotonic and visits each participant once.
  expect(selection.prefixes).toHaveLength(scenario.participantCount);
  let previous = -1n;
  for (const [i, prefix] of selection.prefixes.entries()) {
    expect(prefix).toBeGreaterThanOrEqual(previous === -1n ? 0n : previous);
    previous = prefix + weights[i]!;
  }

  // 17. Prize credit goes to exactly one participant and never exceeds the
  //     draw's allocation.
  const credited = result.prizeCredits.filter((credit) => credit > 0n);
  expect(credited).toHaveLength(1);
  expect(credited[0]).toBe(scenario.prize);
  expect(result.prizeCredits.reduce((a, b) => a + b, 0n)).toBeLessThanOrEqual(scenario.prize);

  // 20 / 21. Deposits and withdrawals after the epoch closed leave the frozen
  //          weights untouched.
  expect(result.weightsAfterPostClose).toEqual(weights);
}

describe(`deterministic scenario corpus (${CORPUS_SIZE} scenarios)`, () => {
  const corpus = generateCorpus(CORPUS_SIZE);
  const results = corpus.map(simulateScenario);

  it("covers every scenario shape", () => {
    const shapes = new Set(corpus.map((s) => s.shape));
    expect(shapes.size).toBeGreaterThanOrEqual(12);
  });

  it("satisfies every expressible invariant on every scenario", () => {
    for (const result of results) checkInvariants(result);
  });

  it("exercises multi-attempt rejection sampling somewhere in the corpus", () => {
    const attemptCounts = results.map((r) => r.selection.attempts.length);
    expect(Math.max(...attemptCounts)).toBeGreaterThanOrEqual(2);
  });

  it("exercises zero-weight participants somewhere in the corpus", () => {
    const withZeroWeight = results.filter(
      (r) => r.selection.total > 0n && r.weights.some((w) => w === 0n),
    );
    expect(withZeroWeight.length).toBeGreaterThan(0);
  });

  it("exercises withdrawal clamping somewhere in the corpus", () => {
    const clamped = results.filter((r) =>
      r.applied.some((a) => a.kind === "withdraw" && a.effectiveAmount < a.amount),
    );
    expect(clamped.length).toBeGreaterThan(0);
  });

  it("is byte-stable across runs for the same seed", () => {
    const again = generateCorpus(64).map(simulateScenario);
    const first = generateCorpus(64).map(simulateScenario);
    const key = (r: SimulationResult): string =>
      `${r.scenario.id}|${r.aggregateWeight}|${r.selection.randomTarget}|${r.selection.winnerIndex}`;
    expect(again.map(key)).toEqual(first.map(key));
  });
});
