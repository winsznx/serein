/**
 * Numeric bounds for Serein.
 *
 * FHE arithmetic has no revert semantics: an `euint64` addition that exceeds
 * 2^64-1 wraps around silently and produces a wrong-but-valid ciphertext. Every
 * encrypted arithmetic path in the protocol therefore needs a bound that is
 * proved here, mirrored in `contracts/libraries/Bounds.sol`, and enforced at the
 * one place where unbounded value can enter the system: the deposit callback.
 *
 * The proof chain is:
 *
 *   1. total principal is capped at MAX_TOTAL_PRINCIPAL = 2^60 - 1 by rejecting
 *      any deposit that would breach it (ERC-7984 receiver returns `false`, the
 *      token refunds the sender);
 *   2. therefore every individual balance <= total <= 2^60;
 *   3. cumulative = SUM(balance * elapsed) <= 2^60 * MAX_ELAPSED_TOTAL = 2^92,
 *      which fits `euint128` with 36 bits of headroom;
 *   4. an epoch weight W_i = cum(end) - cum(start) <= 2^60 * MAX_EPOCH_SECONDS,
 *      and the aggregate T = SUM(W_i) is the same quantity computed on the
 *      aggregate series, so T <= 2^92 as well;
 *   5. nextPowerOfTwo(T) <= 2^93 < 2^128, so the randomness bound never
 *      overflows the type it is drawn into;
 *   6. the running prefix P is monotonically increasing and terminates at T, so
 *      P <= T <= 2^92.
 */

/** Width of the encrypted balance type (`euint64`). */
export const BALANCE_BITS = 64n;

/** Width of the encrypted cumulative / weight type (`euint128`). */
export const WEIGHT_BITS = 128n;

export const MAX_UINT64 = (1n << 64n) - 1n;
export const MAX_UINT128 = (1n << 128n) - 1n;

/**
 * Hard cap on the sum of all principal tracked by the pool, in the confidential
 * token's smallest unit. 2^60 - 1 is ~1.15e18 units, i.e. ~1.15e12 tokens at 6
 * decimals — far beyond any testnet need, and 4 bits below `euint64` so that a
 * single accepted deposit can never wrap the total.
 */
export const MAX_TOTAL_PRINCIPAL = (1n << 60n) - 1n;

/**
 * Upper bound on the total elapsed time the cumulative series may span, in
 * seconds. 2^32 seconds is ~136 years; a deployment cannot outlive it.
 */
export const MAX_ELAPSED_TOTAL = 1n << 32n;

/** Upper bound on a single draw epoch, in seconds. 2^26 is ~2.1 years. */
export const MAX_EPOCH_SECONDS = 1n << 26n;

/** Provable ceiling on any cumulative observation. */
export const MAX_CUMULATIVE = MAX_TOTAL_PRINCIPAL * MAX_ELAPSED_TOTAL;

/**
 * Provable ceiling on a draw's aggregate weight. The random bound is
 * `nextPowerOfTwo(T)`, so the type must also hold `2 * MAX_DRAW_WEIGHT`.
 */
export const MAX_DRAW_WEIGHT = MAX_TOTAL_PRINCIPAL * MAX_EPOCH_SECONDS;

/** Ceiling on a single draw's prize, in confidential token units. */
export const MAX_PRIZE = (1n << 60n) - 1n;

/** Static assertions — these run at import time and at test time. */
export function assertBoundsAreSound(): void {
  const fail = (msg: string): never => {
    throw new Error(`Serein bounds proof violated: ${msg}`);
  };

  if (MAX_TOTAL_PRINCIPAL >= MAX_UINT64) {
    fail("MAX_TOTAL_PRINCIPAL must fit strictly inside euint64");
  }
  // A single accepted deposit is itself bounded by MAX_TOTAL_PRINCIPAL, so the
  // intermediate `total + amount` computed before the bound check must not wrap.
  if (MAX_TOTAL_PRINCIPAL * 2n > MAX_UINT64) {
    fail("total + amount can wrap euint64 before the bound check is applied");
  }
  if (MAX_CUMULATIVE > MAX_UINT128) {
    fail("MAX_CUMULATIVE overflows euint128");
  }
  if (MAX_DRAW_WEIGHT > MAX_CUMULATIVE) {
    fail("MAX_DRAW_WEIGHT exceeds MAX_CUMULATIVE");
  }
  // nextPowerOfTwo(T) <= 2 * T for T > 0, and the bound is drawn into euint128.
  if (MAX_DRAW_WEIGHT * 2n > MAX_UINT128) {
    fail("nextPowerOfTwo(MAX_DRAW_WEIGHT) overflows euint128");
  }
  if (MAX_PRIZE > MAX_UINT64) {
    fail("MAX_PRIZE overflows euint64");
  }
}

assertBoundsAreSound();
