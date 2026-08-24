import { describe, expect, it } from "vitest";

import { MAX_CUMULATIVE, MAX_TOTAL_PRINCIPAL, assertBoundsAreSound } from "../src/bounds.js";
import { TwabSeries, assertAggregateConsistency } from "../src/twab.js";

describe("bounds", () => {
  it("holds the proof chain that keeps FHE arithmetic inside its types", () => {
    expect(() => assertBoundsAreSound()).not.toThrow();
  });
});

describe("TwabSeries", () => {
  it("reports zero cumulative before the series starts", () => {
    const series = new TwabSeries();
    series.write(1000n, 50n);
    expect(series.cumulativeAt(999n)).toBe(0n);
    expect(series.findIndexAtOrBefore(999n)).toBe(-1);
  });

  it("integrates a constant balance linearly", () => {
    const series = new TwabSeries();
    series.write(1000n, 100n);
    expect(series.cumulativeAt(1000n)).toBe(0n);
    expect(series.cumulativeAt(1010n)).toBe(1000n);
    expect(series.weightBetween(1000n, 1010n)).toBe(1000n);
  });

  it("integrates a step change exactly", () => {
    const series = new TwabSeries();
    series.write(0n, 100n); // 100 for 10s -> 1000
    series.write(10n, 300n); // 300 for 10s -> 3000
    series.write(20n, 0n);
    expect(series.weightBetween(0n, 20n)).toBe(4000n);
    expect(series.weightBetween(0n, 30n)).toBe(4000n);
    expect(series.weightBetween(5n, 15n)).toBe(500n + 1500n);
  });

  it("collapses two writes in the same block into one observation", () => {
    const series = new TwabSeries();
    series.write(0n, 100n);
    series.write(10n, 200n);
    series.write(10n, 350n);
    expect(series.length).toBe(2);
    expect(series.current).toBe(350n);
    // The zero-length segment must contribute nothing.
    expect(series.weightBetween(0n, 20n)).toBe(1000n + 3500n);
  });

  it("rejects out-of-order writes", () => {
    const series = new TwabSeries();
    series.write(100n, 1n);
    expect(() => series.write(99n, 1n)).toThrow(/non-decreasing/);
  });

  it("rejects a balance above the total-principal bound", () => {
    const series = new TwabSeries();
    expect(() => series.write(0n, MAX_TOTAL_PRINCIPAL + 1n)).toThrow(/MAX_TOTAL_PRINCIPAL/);
  });

  it("keeps the maximum realistic cumulative inside euint128", () => {
    const series = new TwabSeries();
    series.write(0n, MAX_TOTAL_PRINCIPAL);
    const cumulative = series.cumulativeAt(1n << 32n);
    expect(cumulative).toBe(MAX_CUMULATIVE);
    expect(cumulative).toBeLessThan(1n << 128n);
  });

  it("binary-searches to the latest observation at or before a timestamp", () => {
    const series = new TwabSeries();
    for (let t = 0n; t < 64n; t += 4n) series.write(t, t);
    expect(series.findIndexAtOrBefore(0n)).toBe(0);
    expect(series.findIndexAtOrBefore(3n)).toBe(0);
    expect(series.findIndexAtOrBefore(4n)).toBe(1);
    expect(series.findIndexAtOrBefore(63n)).toBe(15);
    expect(series.findIndexAtOrBefore(1_000n)).toBe(15);
  });

  it("keeps a frozen interval immune to later balance changes", () => {
    const series = new TwabSeries();
    series.write(0n, 100n);
    const frozen = series.weightBetween(0n, 100n);
    series.write(100n, 0n);
    series.write(150n, 999_999n);
    expect(series.weightBetween(0n, 100n)).toBe(frozen);
  });

  it("equates the aggregate series with the sum of user series", () => {
    const alice = new TwabSeries();
    const bob = new TwabSeries();
    const aggregate = new TwabSeries();

    const write = (t: bigint, a: bigint, b: bigint): void => {
      alice.write(t, a);
      bob.write(t, b);
      aggregate.write(t, a + b);
    };

    write(0n, 0n, 0n);
    write(10n, 500n, 0n);
    write(25n, 500n, 1200n);
    write(60n, 100n, 1200n);
    write(90n, 100n, 0n);

    expect(() => assertAggregateConsistency(aggregate, [alice, bob], 0n, 120n)).not.toThrow();
    expect(aggregate.weightBetween(0n, 120n)).toBe(
      alice.weightBetween(0n, 120n) + bob.weightBetween(0n, 120n),
    );
  });
});
