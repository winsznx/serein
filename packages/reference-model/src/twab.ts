/**
 * Plaintext reference implementation of Serein's time-weighted balance series.
 *
 * This is the exact economic idea PoolTogether V5 uses — a cumulative integral
 * of balance over time, sampled at two timestamps to get the average weight
 * across an interval — with one structural difference: in Serein the balance and
 * the cumulative are ciphertexts, while the timestamps and the observation
 * indices stay public. Everything this file computes on `bigint` has a
 * one-to-one counterpart in `EncryptedTWAB.sol`; the split between "public
 * enough to branch on" and "must stay encrypted" is spelled out per function.
 */

import { MAX_CUMULATIVE, MAX_TOTAL_PRINCIPAL } from "./bounds.js";

export interface Observation {
  /** Public. Unix seconds. Monotonically non-decreasing across the series. */
  readonly timestamp: bigint;
  /** Encrypted onchain (`euint64`). Balance in effect from `timestamp` onward. */
  readonly balance: bigint;
  /** Encrypted onchain (`euint128`). Integral of balance up to `timestamp`. */
  readonly cumulative: bigint;
}

export class TwabSeries {
  private readonly observations: Observation[] = [];

  get length(): number {
    return this.observations.length;
  }

  get current(): bigint {
    const last = this.observations.at(-1);
    return last ? last.balance : 0n;
  }

  at(index: number): Observation {
    const obs = this.observations[index];
    if (obs === undefined) throw new RangeError(`no observation at index ${index}`);
    return obs;
  }

  snapshot(): readonly Observation[] {
    return [...this.observations];
  }

  /**
   * Record a new balance taking effect at `timestamp`.
   *
   * Two writes landing in the same block must collapse into one observation,
   * otherwise the series would contain a zero-length segment whose `balance`
   * silently shadows the earlier one during lookup. Onchain the same rule
   * applies, and it is what makes `cumulativeAt` well defined at a boundary that
   * several transactions share.
   */
  write(timestamp: bigint, newBalance: bigint): void {
    if (newBalance < 0n) throw new RangeError("balance cannot be negative");
    if (newBalance > MAX_TOTAL_PRINCIPAL) {
      throw new RangeError("balance exceeds MAX_TOTAL_PRINCIPAL");
    }

    const last = this.observations.at(-1);

    if (last === undefined) {
      this.observations.push({ timestamp, balance: newBalance, cumulative: 0n });
      return;
    }

    if (timestamp < last.timestamp) {
      throw new RangeError("observations must be written in non-decreasing timestamp order");
    }

    if (timestamp === last.timestamp) {
      // Same block: replace the balance in place, cumulative is unaffected
      // because the segment it would have measured has zero length.
      this.observations[this.observations.length - 1] = {
        timestamp,
        balance: newBalance,
        cumulative: last.cumulative,
      };
      return;
    }

    const cumulative = last.cumulative + last.balance * (timestamp - last.timestamp);
    if (cumulative > MAX_CUMULATIVE) {
      throw new RangeError("cumulative exceeds MAX_CUMULATIVE");
    }
    this.observations.push({ timestamp, balance: newBalance, cumulative });
  }

  /**
   * Index of the latest observation at or before `timestamp`, or -1 when the
   * series starts after it.
   *
   * Onchain this is a binary search over public timestamps — the branch
   * condition never touches a ciphertext, which is exactly why the search is
   * possible at all under FHE.
   */
  findIndexAtOrBefore(timestamp: bigint): number {
    let lo = 0;
    let hi = this.observations.length - 1;
    let found = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (this.at(mid).timestamp <= timestamp) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return found;
  }

  /**
   * Integral of balance from series start to `timestamp`.
   *
   * Onchain the returned value is an `euint128`: the observation lookup is
   * public, the extrapolation multiplier `(timestamp - obs.timestamp)` is public,
   * and only `obs.balance` and `obs.cumulative` are ciphertexts.
   */
  cumulativeAt(timestamp: bigint): bigint {
    const index = this.findIndexAtOrBefore(timestamp);
    if (index < 0) return 0n;
    const obs = this.at(index);
    return obs.cumulative + obs.balance * (timestamp - obs.timestamp);
  }

  /**
   * Weight accrued across `[start, end]`.
   *
   * This is the quantity that makes withdrawal-during-a-draw safe: it reads two
   * frozen historical points, so a balance change after `end` cannot move it.
   */
  weightBetween(start: bigint, end: bigint): bigint {
    if (end < start) throw new RangeError("end must be >= start");
    return this.cumulativeAt(end) - this.cumulativeAt(start);
  }
}

/**
 * Aggregate weight computed from the global series.
 *
 * The protocol relies on this identity:
 *
 *     aggregate.weightBetween(s, e) === SUM_i users[i].weightBetween(s, e)
 *
 * It holds because the aggregate balance function is the pointwise sum of the
 * user balance functions, the integral is linear, and every write to a user
 * series is paired with a write to the aggregate series at the same timestamp.
 * `assertAggregateConsistency` is the executable form of that argument.
 */
export function assertAggregateConsistency(
  aggregate: TwabSeries,
  users: readonly TwabSeries[],
  start: bigint,
  end: bigint,
): void {
  const total = aggregate.weightBetween(start, end);
  const summed = users.reduce((acc, series) => acc + series.weightBetween(start, end), 0n);
  if (total !== summed) {
    throw new Error(
      `aggregate weight ${total} does not equal the sum of individual weights ${summed}`,
    );
  }
}
