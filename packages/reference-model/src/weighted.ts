/**
 * Plaintext reference implementation of Serein's exact weighted selection.
 *
 * The mechanism has to produce P(i wins) = W_i / SUM(W) exactly, using a source
 * of randomness whose only bounded form takes a power-of-two ceiling. Rejection
 * sampling closes that gap without approximation:
 *
 *   B = nextPowerOfTwo(T)        // smallest power of two >= T, so T <= B < 2T
 *   r ~ Uniform{0, ..., B-1}
 *   accept iff r < T
 *
 * Conditioned on acceptance, r is uniform on {0, ..., T-1}:
 *
 *   P(r = x | r < T) = P(r = x) / P(r < T) = (1/B) / (T/B) = 1/T
 *
 * for every x in [0, T). Rejection carries no information about which x would
 * have been drawn, so restarting with a fresh candidate preserves uniformity.
 * Because T <= B < 2T the acceptance probability is > 1/2 and the expected
 * number of candidates is < 2 regardless of T.
 *
 * A uniform r on [0, T) then lands in participant i's half-open prefix interval
 * [P_i, P_i + W_i) with probability exactly W_i / T. Zero-weight participants
 * own empty intervals and are structurally unable to win.
 */

import { MAX_DRAW_WEIGHT } from "./bounds.js";

/** Smallest power of two >= value. Defined for value >= 1. */
export function nextPowerOfTwo(value: bigint): bigint {
  if (value <= 0n) throw new RangeError("nextPowerOfTwo requires a positive value");
  if (value > MAX_DRAW_WEIGHT) throw new RangeError("value exceeds MAX_DRAW_WEIGHT");

  let power = 1n;
  while (power < value) power <<= 1n;
  return power;
}

export interface AcceptanceAttempt {
  readonly candidate: bigint;
  readonly accepted: boolean;
}

export interface SelectionResult {
  /** Verified aggregate weight. Public by design — see PRIVACY.md. */
  readonly total: bigint;
  /** Power-of-two randomness ceiling derived publicly from `total`. */
  readonly bound: bigint;
  /** Every candidate drawn, including the rejected ones. */
  readonly attempts: readonly AcceptanceAttempt[];
  /** The accepted candidate. Stays encrypted onchain, never publicly decrypted. */
  readonly randomTarget: bigint;
  /** Index into the participant registry, or -1 when no participant has weight. */
  readonly winnerIndex: number;
  /** Exclusive prefix sums, one per participant. Encrypted onchain. */
  readonly prefixes: readonly bigint[];
  /** Final prefix. Must equal `total` for the draw to finalize. */
  readonly finalPrefix: bigint;
}

/**
 * Draw a candidate uniformly from [0, bound) and decide acceptance.
 *
 * Onchain: `r = FHE.randEuint128(bound)` then `accepted = FHE.lt(r, total)`.
 * Only `accepted` is ever made publicly decryptable; `r` stays a ciphertext for
 * the life of the draw.
 */
export function attemptCandidate(
  total: bigint,
  bound: bigint,
  drawUniformBelow: (exclusiveBound: bigint) => bigint,
): AcceptanceAttempt {
  const candidate = drawUniformBelow(bound);
  if (candidate < 0n || candidate >= bound) {
    throw new RangeError("randomness source returned a value outside [0, bound)");
  }
  return { candidate, accepted: candidate < total };
}

/**
 * Locate the winner by walking the participant registry in its public order and
 * accumulating an encrypted prefix.
 *
 * Onchain this happens in bounded batches so a single transaction never exceeds
 * the HCU ceiling; the cursor is stored, so the walk is resumable and each
 * participant is visited exactly once.
 */
export function selectByPrefixIntervals(
  weights: readonly bigint[],
  randomTarget: bigint,
): { winnerIndex: number; prefixes: bigint[]; finalPrefix: bigint } {
  const prefixes: bigint[] = [];
  let prefix = 0n;
  let winnerIndex = -1;

  for (const weight of weights) {
    if (weight < 0n) throw new RangeError("weights cannot be negative");
    prefixes.push(prefix);
    const start = prefix;
    const end = prefix + weight;
    // Half-open interval: an empty interval (weight === 0) can never contain a
    // point, which is what structurally excludes zero-weight participants.
    if (randomTarget >= start && randomTarget < end) {
      if (winnerIndex !== -1) {
        throw new Error("two participants matched the same random target");
      }
      winnerIndex = prefixes.length - 1;
    }
    prefix = end;
  }

  return { winnerIndex, prefixes, finalPrefix: prefix };
}

/**
 * Run one complete draw: aggregate, bound, sample until accepted, then select.
 */
export function runWeightedDraw(
  weights: readonly bigint[],
  drawUniformBelow: (exclusiveBound: bigint) => bigint,
  maxAttempts = 128,
): SelectionResult {
  const total = weights.reduce((acc, w) => acc + w, 0n);

  if (total === 0n) {
    return {
      total: 0n,
      bound: 0n,
      attempts: [],
      randomTarget: 0n,
      winnerIndex: -1,
      prefixes: weights.map(() => 0n),
      finalPrefix: 0n,
    };
  }
  if (total > MAX_DRAW_WEIGHT) throw new RangeError("total exceeds MAX_DRAW_WEIGHT");

  const bound = nextPowerOfTwo(total);
  const attempts: AcceptanceAttempt[] = [];

  for (let i = 0; i < maxAttempts; i++) {
    const attempt = attemptCandidate(total, bound, drawUniformBelow);
    attempts.push(attempt);
    if (!attempt.accepted) continue;

    const { winnerIndex, prefixes, finalPrefix } = selectByPrefixIntervals(
      weights,
      attempt.candidate,
    );
    if (finalPrefix !== total) {
      throw new Error(`prefix consistency failed: ${finalPrefix} !== ${total}`);
    }
    if (winnerIndex === -1) {
      throw new Error("accepted candidate matched no participant, which is impossible");
    }
    return {
      total,
      bound,
      attempts,
      randomTarget: attempt.candidate,
      winnerIndex,
      prefixes,
      finalPrefix,
    };
  }

  // P(no acceptance in n attempts) < 2^-n, so this is unreachable in practice
  // and is a bug signal rather than an operational condition.
  throw new Error(`rejection sampling did not converge in ${maxAttempts} attempts`);
}
