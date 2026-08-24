// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title Bounds
 * @notice Numeric ceilings that keep every encrypted arithmetic path inside its type.
 *
 * @dev FHE arithmetic has no revert semantics. `FHE.add` on two `euint64` values whose sum exceeds
 *      2^64-1 produces a wrapped ciphertext that is indistinguishable from a correct one — there is
 *      no exception to catch and no way to notice after the fact. Correctness therefore has to come
 *      from a bound argument established before the operation, not from a check after it.
 *
 *      The chain, proved once here and mirrored in `packages/reference-model/src/bounds.ts`:
 *
 *      1. Total principal is capped at `MAX_TOTAL_PRINCIPAL` = 2^60-1. The cap is enforced at the
 *         single point where value enters the system — the ERC-7984 receiver callback — by returning
 *         an encrypted `false`, which makes the token refund the sender rather than crediting a
 *         silently clamped amount.
 *      2. Hence every individual balance <= total <= 2^60-1, comfortably inside `euint64`, and
 *         `total + amount` computed before the comparison cannot itself wrap because
 *         2 * MAX_TOTAL_PRINCIPAL < 2^64.
 *      3. A cumulative observation is SUM(balance * elapsed) <= 2^60 * MAX_ELAPSED_TOTAL = 2^92,
 *         which fits `euint128` with 36 bits of headroom.
 *      4. An epoch weight W_i = cum(end) - cum(start) <= 2^60 * MAX_EPOCH_SECONDS = 2^86. The
 *         aggregate T = SUM(W_i) is the same quantity computed on the aggregate series, so it obeys
 *         the same ceiling.
 *      5. `nextPowerOfTwo(T)` <= 2^87 < 2^128, so the randomness bound never overflows the type it
 *         is drawn into.
 *      6. The running prefix P increases monotonically and terminates at T, so P <= T <= 2^86.
 *
 *      `MAX_ELAPSED_TOTAL` is 2^32 seconds (~136 years). A deployment cannot outlive it, so step 3
 *      holds for the life of the contract rather than for a configured window.
 */
library Bounds {
    /// @dev Ceiling on the sum of all principal, in the confidential token's smallest unit.
    ///      2^60-1 is ~1.15e18 units, i.e. ~1.15e12 tokens at 6 decimals.
    uint64 internal constant MAX_TOTAL_PRINCIPAL = uint64((1 << 60) - 1);

    /// @dev Ceiling on the total time span a cumulative series may cover, in seconds.
    uint128 internal constant MAX_ELAPSED_TOTAL = uint128(1) << 32;

    /// @dev Ceiling on a single draw epoch, in seconds (~2.1 years).
    uint64 internal constant MAX_EPOCH_SECONDS = uint64(1) << 26;

    /// @dev Provable ceiling on any cumulative observation. Fits euint128 with 36 bits spare.
    uint128 internal constant MAX_CUMULATIVE = uint128(MAX_TOTAL_PRINCIPAL) * MAX_ELAPSED_TOTAL;

    /// @dev Provable ceiling on a draw's aggregate weight.
    uint128 internal constant MAX_DRAW_WEIGHT =
        uint128(MAX_TOTAL_PRINCIPAL) * uint128(MAX_EPOCH_SECONDS);

    /// @dev Ceiling on a single draw's prize, in confidential token units.
    uint64 internal constant MAX_PRIZE = uint64((1 << 60) - 1);

    /**
     * @dev Smallest power of two >= `value`.
     *
     * The Zama coprocessor only accepts a power-of-two upper bound for bounded randomness, which is
     * why the draw cannot sample directly over an arbitrary aggregate weight and needs the rejection
     * step in `ExactWeightedRandom`.
     *
     * Reverts on zero (a draw with no weight never reaches this) and on any value past
     * `MAX_DRAW_WEIGHT`, so the returned bound is always < 2^87 and safely inside `uint128`.
     */
    function nextPowerOfTwo(uint128 value) internal pure returns (uint128) {
        require(value > 0, ZeroDrawWeight());
        require(value <= MAX_DRAW_WEIGHT, DrawWeightOutOfBounds(value));

        uint128 power = 1;
        while (power < value) {
            power <<= 1;
        }
        return power;
    }

    error ZeroDrawWeight();
    error DrawWeightOutOfBounds(uint128 value);
}
