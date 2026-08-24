import { describe, expect, it } from "vitest";

import { MAX_DRAW_WEIGHT } from "../src/bounds.js";
import { Prng } from "../src/prng.js";
import {
  attemptCandidate,
  nextPowerOfTwo,
  runWeightedDraw,
  selectByPrefixIntervals,
} from "../src/weighted.js";

describe("nextPowerOfTwo", () => {
  it("is the identity on powers of two", () => {
    // MAX_DRAW_WEIGHT is (2^60 - 1) * 2^26, so 2^85 is the largest power of two
    // a real draw total can reach.
    for (let k = 0n; k <= 85n; k++) {
      expect(nextPowerOfTwo(1n << k)).toBe(1n << k);
    }
    expect(1n << 85n).toBeLessThanOrEqual(MAX_DRAW_WEIGHT);
    expect(1n << 86n).toBeGreaterThan(MAX_DRAW_WEIGHT);
  });

  it("rounds up strictly between powers of two", () => {
    expect(nextPowerOfTwo(1n)).toBe(1n);
    expect(nextPowerOfTwo(2n)).toBe(2n);
    expect(nextPowerOfTwo(3n)).toBe(4n);
    expect(nextPowerOfTwo(5n)).toBe(8n);
    expect(nextPowerOfTwo(255n)).toBe(256n);
    expect(nextPowerOfTwo(257n)).toBe(512n);
  });

  it("always returns a bound in [T, 2T)", () => {
    const prng = new Prng("next-pow-2");
    for (let i = 0; i < 5_000; i++) {
      const value = prng.nextRange(1n, 1n << 70n);
      const bound = nextPowerOfTwo(value);
      expect(bound).toBeGreaterThanOrEqual(value);
      expect(bound).toBeLessThan(value * 2n);
      expect(bound & (bound - 1n)).toBe(0n);
    }
  });

  it("rejects zero and values past the draw-weight ceiling", () => {
    expect(() => nextPowerOfTwo(0n)).toThrow(/positive/);
    expect(() => nextPowerOfTwo(-1n)).toThrow(/positive/);
    expect(() => nextPowerOfTwo(MAX_DRAW_WEIGHT + 1n)).toThrow(/MAX_DRAW_WEIGHT/);
  });

  it("keeps the bound inside euint128 at the ceiling", () => {
    expect(nextPowerOfTwo(MAX_DRAW_WEIGHT)).toBeLessThan(1n << 128n);
  });
});

describe("rejection sampling", () => {
  it("accepts exactly the candidates below the total", () => {
    const total = 5n;
    const bound = nextPowerOfTwo(total); // 8
    for (let candidate = 0n; candidate < bound; candidate++) {
      const attempt = attemptCandidate(total, bound, () => candidate);
      expect(attempt.accepted).toBe(candidate < total);
    }
  });

  it("rejects a randomness source that returns out-of-range values", () => {
    expect(() => attemptCandidate(5n, 8n, () => 8n)).toThrow(/outside/);
    expect(() => attemptCandidate(5n, 8n, () => -1n)).toThrow(/outside/);
  });

  it("produces a uniform accepted candidate over [0, T)", () => {
    // The conditional-uniformity proof, checked empirically at small T.
    const total = 5n;
    const counts = new Map<bigint, number>();
    const prng = new Prng("uniform-accept");
    const samples = 200_000;

    for (let i = 0; i < samples; i++) {
      const result = runWeightedDraw(
        [1n, 1n, 1n, 1n, 1n],
        (bound) => prng.nextBelow(bound),
      );
      counts.set(result.randomTarget, (counts.get(result.randomTarget) ?? 0) + 1);
    }

    expect(counts.size).toBe(Number(total));
    const expected = samples / Number(total);
    for (const [, observed] of counts) {
      // 5-sigma band for a binomial with p = 1/5.
      const sigma = Math.sqrt(samples * (1 / 5) * (4 / 5));
      expect(Math.abs(observed - expected)).toBeLessThan(5 * sigma);
    }
  });

  it("keeps acceptance probability above one half", () => {
    const prng = new Prng("acceptance-rate");
    for (let trial = 0; trial < 200; trial++) {
      const total = prng.nextRange(1n, 1n << 40n);
      const bound = nextPowerOfTwo(total);
      // T/B > 1/2 because B < 2T.
      expect(total * 2n).toBeGreaterThan(bound);
    }
  });
});

describe("prefix interval selection", () => {
  it("assigns each target to exactly one participant", () => {
    const weights = [3n, 0n, 5n, 2n];
    const total = 10n;
    const seen = new Set<number>();
    for (let target = 0n; target < total; target++) {
      const { winnerIndex, finalPrefix } = selectByPrefixIntervals(weights, target);
      expect(finalPrefix).toBe(total);
      expect(winnerIndex).toBeGreaterThanOrEqual(0);
      seen.add(winnerIndex);
    }
    // The zero-weight participant at index 1 is never selected.
    expect([...seen].sort()).toEqual([0, 2, 3]);
  });

  it("never selects a zero-weight participant", () => {
    const weights = [0n, 0n, 7n, 0n];
    for (let target = 0n; target < 7n; target++) {
      expect(selectByPrefixIntervals(weights, target).winnerIndex).toBe(2);
    }
  });

  it("terminates the prefix exactly at the total", () => {
    const prng = new Prng("prefix-consistency");
    for (let trial = 0; trial < 2_000; trial++) {
      const count = prng.nextInt(1, 40);
      const weights = Array.from({ length: count }, () => prng.nextRange(0n, 1n << 30n));
      const total = weights.reduce((a, b) => a + b, 0n);
      const { finalPrefix } = selectByPrefixIntervals(weights, 0n);
      expect(finalPrefix).toBe(total);
    }
  });

  it("returns no winner when the target sits past the total", () => {
    expect(selectByPrefixIntervals([1n, 2n], 3n).winnerIndex).toBe(-1);
  });

  it("rejects negative weights", () => {
    expect(() => selectByPrefixIntervals([1n, -1n], 0n)).toThrow(/negative/);
  });
});

describe("runWeightedDraw", () => {
  it("returns no winner and no bound when every weight is zero", () => {
    const result = runWeightedDraw([0n, 0n, 0n], () => 0n);
    expect(result.total).toBe(0n);
    expect(result.winnerIndex).toBe(-1);
    expect(result.attempts).toHaveLength(0);
  });

  it("records every rejected attempt and uses only the accepted one", () => {
    // T = 5, B = 8. Feed 7 (reject), 6 (reject), 5 (reject), 2 (accept).
    const queue = [7n, 6n, 5n, 2n];
    const result = runWeightedDraw([2n, 3n], () => queue.shift()!);
    expect(result.attempts.map((a) => a.candidate)).toEqual([7n, 6n, 5n, 2n]);
    expect(result.attempts.filter((a) => a.accepted)).toHaveLength(1);
    expect(result.randomTarget).toBe(2n);
    expect(result.winnerIndex).toBe(1); // interval [2, 5)
  });

  it("matches the theoretical win probability across weight vectors", () => {
    const vectors: bigint[][] = [
      [1n, 1n],
      [1n, 2n],
      [1n, 2n, 7n],
      [1n, 1n, 1n, 1n, 1n, 1n],
      [97n, 3n],
      [1n, 0n, 4n, 0n, 5n],
    ];

    for (const [index, weights] of vectors.entries()) {
      const total = weights.reduce((a, b) => a + b, 0n);
      const samples = 120_000;
      const wins = new Array<number>(weights.length).fill(0);
      const prng = new Prng(`fairness/${index}`);

      for (let i = 0; i < samples; i++) {
        const result = runWeightedDraw(weights, (bound) => prng.nextBelow(bound));
        wins[result.winnerIndex]! += 1;
      }

      for (const [i, weight] of weights.entries()) {
        const p = Number(weight) / Number(total);
        const observed = wins[i]! / samples;
        if (p === 0) {
          expect(observed).toBe(0);
          continue;
        }
        // 5-sigma band; sigma = sqrt(p(1-p)/n).
        const sigma = Math.sqrt((p * (1 - p)) / samples);
        expect(Math.abs(observed - p)).toBeLessThan(5 * sigma);
      }
    }
  });
});
