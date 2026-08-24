// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, euint128} from "@fhevm/solidity/lib/FHE.sol";

import {Bounds} from "./Bounds.sol";

/**
 * @title EncryptedTWAB
 * @notice Time-weighted balance accounting where the balance is a ciphertext.
 *
 * @dev PoolTogether's TWAB exists so savers can enter and leave whenever they like while prize
 *      weight still reflects how much liquidity they actually contributed, and for how long. The
 *      mechanism is an integral: keep a running `cumulative` of balance-seconds, and the weight
 *      across any interval is the difference of the integral at its two endpoints.
 *
 *      Serein needs the same economics with the balance encrypted. The split that makes this
 *      possible is that the *time* axis stays public:
 *
 *        - `timestamp` is plaintext, so observations can be binary-searched;
 *        - the extrapolation multiplier `(t - obs.timestamp)` is plaintext, so the multiply is a
 *          scalar operation rather than the much costlier ciphertext-by-ciphertext one;
 *        - only `balance` and `cumulative` are ever ciphertexts.
 *
 *      Nothing about *when* a saver acted is hidden — that is already public from the transaction
 *      itself. What stays hidden is how much, which is the whole point.
 *
 *      Storage is append-only. PoolTogether overwrites observations within a period using a ring
 *      buffer; doing that correctly requires a period-alignment argument that has to hold against
 *      the draw boundaries, and getting it subtly wrong would corrupt weights silently rather than
 *      revert. Append-only is chosen deliberately: lookups are O(log n) by binary search over public
 *      timestamps, no draw operation ever scans a series linearly, and the growth cost is a
 *      documented tradeoff rather than a hidden one. See DECISIONS.md.
 */
library EncryptedTWAB {
    struct Observation {
        /// @dev Public. Unix seconds. Non-decreasing across the series.
        uint64 timestamp;
        /// @dev Encrypted. Balance in effect from `timestamp` until the next observation.
        euint64 balance;
        /// @dev Encrypted. Integral of balance from series start up to `timestamp`.
        euint128 cumulative;
    }

    struct Series {
        Observation[] observations;
    }

    error TimestampOutOfOrder(uint64 last, uint64 next);
    error EpochTooLong(uint64 start, uint64 end);

    /**
     * @notice Record `newBalance` taking effect at `timestamp`.
     *
     * @dev Two writes in the same block collapse into one observation. Without that rule the series
     *      would contain a zero-length segment whose balance shadows the earlier one during lookup,
     *      and `cumulativeAt` would stop being well defined at a boundary that several transactions
     *      share. Since the collapsed segment has zero length it contributes nothing to the
     *      integral, so overwriting the balance in place is exact rather than approximate.
     *
     *      Costs no FHE operations when the series is empty or the timestamp repeats; otherwise one
     *      cast, one scalar multiply and one addition on `euint128`.
     */
    function write(Series storage self, uint64 timestamp, euint64 newBalance) internal {
        uint256 count = self.observations.length;

        if (count == 0) {
            euint128 zero = FHE.asEuint128(0);
            FHE.allowThis(zero);
            FHE.allowThis(newBalance);
            self.observations.push(
                Observation({timestamp: timestamp, balance: newBalance, cumulative: zero})
            );
            return;
        }

        Observation storage last = self.observations[count - 1];
        require(timestamp >= last.timestamp, TimestampOutOfOrder(last.timestamp, timestamp));

        if (timestamp == last.timestamp) {
            FHE.allowThis(newBalance);
            last.balance = newBalance;
            return;
        }

        euint128 cumulative = _extrapolate(last.cumulative, last.balance, timestamp - last.timestamp);
        FHE.allowThis(cumulative);
        FHE.allowThis(newBalance);
        self.observations.push(
            Observation({timestamp: timestamp, balance: newBalance, cumulative: cumulative})
        );
    }

    /**
     * @notice Integral of balance from series start to `timestamp`.
     *
     * @dev Returns a trivially-encrypted zero when the series starts after `timestamp`, which is the
     *      correct value for an address that had not yet deposited: it accrued no weight.
     *
     *      The returned handle is granted to the calling contract but to nobody else. Historical
     *      cumulative values are never exposed to users — an individual's integral at two points is
     *      enough to reconstruct their balance, so granting it would defeat the confidentiality the
     *      protocol exists to provide.
     */
    function cumulativeAt(Series storage self, uint64 timestamp) internal returns (euint128) {
        uint256 count = self.observations.length;
        if (count == 0) {
            euint128 zero = FHE.asEuint128(0);
            FHE.allowThis(zero);
            return zero;
        }

        (bool found, uint256 index) = findIndexAtOrBefore(self, timestamp);
        if (!found) {
            euint128 zero = FHE.asEuint128(0);
            FHE.allowThis(zero);
            return zero;
        }

        Observation storage observation = self.observations[index];
        if (observation.timestamp == timestamp) {
            return observation.cumulative;
        }

        euint128 result = _extrapolate(
            observation.cumulative,
            observation.balance,
            timestamp - observation.timestamp
        );
        FHE.allowThis(result);
        return result;
    }

    /**
     * @notice Weight accrued across `[start, end]`.
     *
     * @dev This is the operation that makes withdrawing during a draw safe. It reads two frozen
     *      historical points, so a balance change after `end` moves neither of them. A saver can
     *      take their principal out the moment a draw closes without altering the weight that draw
     *      already assigned them, and without being able to alter anyone else's.
     */
    function weightBetween(
        Series storage self,
        uint64 start,
        uint64 end
    ) internal returns (euint128) {
        require(end >= start && end - start <= Bounds.MAX_EPOCH_SECONDS, EpochTooLong(start, end));
        euint128 weight = FHE.sub(cumulativeAt(self, end), cumulativeAt(self, start));
        FHE.allowThis(weight);
        return weight;
    }

    /**
     * @notice Index of the latest observation at or before `timestamp`.
     * @return found False when the series begins after `timestamp`.
     *
     * @dev Binary search over plaintext timestamps. This is the reason the whole construction works:
     *      an encrypted timestamp would make the comparison a ciphertext and the search impossible,
     *      because FHE cannot branch on a hidden condition.
     */
    function findIndexAtOrBefore(
        Series storage self,
        uint64 timestamp
    ) internal view returns (bool found, uint256 index) {
        uint256 count = self.observations.length;
        if (count == 0 || self.observations[0].timestamp > timestamp) {
            return (false, 0);
        }

        uint256 low = 0;
        uint256 high = count - 1;
        while (low < high) {
            uint256 mid = (low + high + 1) / 2;
            if (self.observations[mid].timestamp <= timestamp) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        return (true, low);
    }

    function length(Series storage self) internal view returns (uint256) {
        return self.observations.length;
    }

    function timestampAt(Series storage self, uint256 index) internal view returns (uint64) {
        return self.observations[index].timestamp;
    }

    function observationAt(
        Series storage self,
        uint256 index
    ) internal view returns (uint64 timestamp, euint64 balance, euint128 cumulative) {
        Observation storage observation = self.observations[index];
        return (observation.timestamp, observation.balance, observation.cumulative);
    }

    function latestTimestamp(Series storage self) internal view returns (uint64) {
        uint256 count = self.observations.length;
        return count == 0 ? 0 : self.observations[count - 1].timestamp;
    }

    /// @dev cumulative + balance * elapsed, widened to euint128 before the multiply so the product
    ///      cannot wrap. `elapsed` is plaintext, so this is a scalar multiply.
    function _extrapolate(
        euint128 cumulative,
        euint64 balance,
        uint64 elapsed
    ) private returns (euint128) {
        return FHE.add(cumulative, FHE.mul(FHE.asEuint128(balance), uint128(elapsed)));
    }
}
