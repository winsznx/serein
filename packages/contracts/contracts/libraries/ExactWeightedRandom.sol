// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint128} from "@fhevm/solidity/lib/FHE.sol";

import {Bounds} from "./Bounds.sol";

/**
 * @title ExactWeightedRandom
 * @notice Deposit-weighted selection that is exact rather than approximate, using encrypted
 *         randomness whose only bounded form takes a power-of-two ceiling.
 *
 * @dev The obvious shortcut — score each participant as `balance_i * random_i` and take the argmax —
 *      does not produce `W_i / SUM(W)`. It produces whatever distribution the product of a weight
 *      and a uniform variate happens to induce, which is not the advertised one. Serein does not use
 *      it.
 *
 *      What the coprocessor offers is `FHE.randEuint128(bound)` with `bound` a plaintext power of
 *      two. Rejection sampling turns that into a uniform draw over an arbitrary total with no
 *      approximation anywhere:
 *
 *          B = nextPowerOfTwo(T)          so that T <= B < 2T
 *          r ~ Uniform{0, ..., B-1}
 *          accept iff r < T
 *
 *      Conditioned on acceptance, r is uniform on {0, ..., T-1}:
 *
 *          P(r = x | r < T) = P(r = x) / P(r < T) = (1/B) / (T/B) = 1/T
 *
 *      for every x in [0, T). A rejection reveals only that the candidate was >= T, which says
 *      nothing about which value below T would have been drawn, so restarting with a fresh candidate
 *      preserves uniformity exactly. Because B < 2T the acceptance probability always exceeds 1/2
 *      and the expected number of candidates is below 2 regardless of T.
 *
 *      A uniform r on [0, T) then lands in participant i's half-open prefix interval
 *      [P_i, P_i + W_i) with probability exactly W_i / T. The intervals partition [0, T) by
 *      construction, so exactly one participant matches. Zero-weight participants own empty
 *      intervals and are structurally unable to win — not merely unlikely to.
 *
 *      The full argument, including why the aggregate has to be public for any of this to work, is
 *      in ARCHITECTURE.md.
 */
library ExactWeightedRandom {
    /**
     * @notice Draw a fresh encrypted candidate uniformly from [0, bound).
     *
     * @dev The returned handle is granted to the calling contract only. It must never be made
     *      publicly decryptable and never granted to a user: knowing the random target plus the
     *      public participant order would let anyone identify the winner, which is precisely the
     *      fact the protocol keeps encrypted.
     */
    function drawCandidate(uint128 bound) internal returns (euint128 candidate) {
        candidate = FHE.randEuint128(bound);
        FHE.allowThis(candidate);
    }

    /**
     * @notice Encrypted predicate for "this candidate is inside the usable range".
     *
     * @dev Only this boolean is ever made publicly decryptable. It discloses whether a particular
     *      attempt succeeded — an operational fact already visible from the transaction transcript —
     *      and nothing about the candidate's value.
     */
    function acceptancePredicate(
        euint128 candidate,
        uint128 total
    ) internal returns (ebool accepted) {
        accepted = FHE.lt(candidate, total);
        FHE.allowThis(accepted);
    }

    /**
     * @notice Encrypted predicate for "the target falls inside this participant's interval".
     *
     * @dev `[prefix, prefix + weight)` is half-open, so a zero-weight participant produces an empty
     *      interval that no point can satisfy. That is what makes zero-weight exclusion structural.
     *
     *      Costs one comparison per endpoint plus a boolean AND. The result is granted to the
     *      calling contract only; it is never public and never user-decryptable, because a winner
     *      predicate that anyone could read would reveal the winner.
     */
    function winnerPredicate(
        euint128 target,
        euint128 prefix,
        euint128 weight
    ) internal returns (ebool isWinner, euint128 nextPrefix) {
        nextPrefix = FHE.add(prefix, weight);
        isWinner = FHE.and(FHE.ge(target, prefix), FHE.lt(target, nextPrefix));
        FHE.allowThis(isWinner);
        FHE.allowThis(nextPrefix);
    }

    /**
     * @notice Encrypted predicate for "the prefix walk covered exactly the verified aggregate".
     *
     * @dev The walk visits each participant once and accumulates their weight, so the final prefix
     *      must equal the aggregate the KMS already proved. A mismatch means the aggregate series
     *      and the individual series disagree, which is a bug rather than an operational condition,
     *      and the draw is blocked from finalizing until it is investigated.
     *
     *      This is a detection gate, not a payment gate. Payment safety comes from the partition
     *      property: the intervals tile [0, P) with no overlap, and the target is below T, so at
     *      most one participant can ever match no matter what P turns out to be.
     */
    function consistencyPredicate(
        euint128 finalPrefix,
        uint128 total
    ) internal returns (ebool consistent) {
        consistent = FHE.eq(finalPrefix, total);
        FHE.allowThis(consistent);
    }

    /// @dev Re-exported so callers get the bound and its validation from one place.
    function boundFor(uint128 total) internal pure returns (uint128) {
        return Bounds.nextPowerOfTwo(total);
    }
}
