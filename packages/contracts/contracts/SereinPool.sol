// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

import {ISereinPool} from "./interfaces/ISereinPool.sol";
import {ISereinPrizeReserve} from "./interfaces/ISereinPrizeReserve.sol";
import {Bounds} from "./libraries/Bounds.sol";
import {DrawState} from "./libraries/DrawState.sol";
import {EncryptedTWAB} from "./libraries/EncryptedTWAB.sol";
import {ExactWeightedRandom} from "./libraries/ExactWeightedRandom.sol";

/**
 * @title SereinPool
 * @notice Confidential savings with exact deposit-weighted prize draws.
 *
 * @dev The pool holds principal and nothing else. It has no authority to spend prize funds, and the
 *      prize reserve has no authority to touch principal — the two live in separate contracts with
 *      no path between them. That is what makes "no-loss" structural: there is no admin decision, no
 *      configuration flag, and no code path through which a draw can reduce someone's savings. The
 *      only thing a draw can do to a saver is credit them.
 *
 *      Three properties drive the design:
 *
 *      Weight is time-weighted, not point-in-time. A saver who deposits one minute before a draw
 *      closes should not have the same odds as one who held the same balance all epoch. Weight is
 *      the integral of balance over the epoch, read from two frozen historical points. That is also
 *      what lets someone withdraw the instant a draw closes without changing the weight that draw
 *      already assigned them.
 *
 *      Selection is exact, not approximate. The aggregate weight is published — deliberately, and
 *      only after it is frozen — because sampling uniformly over an arbitrary total needs a
 *      plaintext bound, and the coprocessor's bounded randomness only takes powers of two. Rejection
 *      sampling closes that gap with no approximation. Every individual weight, the random target,
 *      and the winner stay encrypted throughout.
 *
 *      Progress is permissionless and resumable. A draw crosses three asynchronous boundaries where
 *      it waits on the Zama KMS, plus a fourth imposed by the HCU ceiling on any single transaction.
 *      Each is an explicit state, any address can push the draw forward, and a failed batch leaves
 *      the cursor exactly where it was. A keeper is a convenience, never a dependency, and a
 *      compromised keeper gains nothing beyond the ability to spend its own gas.
 */
contract SereinPool is ISereinPool, IERC7984Receiver, ZamaEthereumConfig {
    using EncryptedTWAB for EncryptedTWAB.Series;

    /// @dev Largest number of participants a single selection batch may walk.
    ///
    ///      Measured, not estimated. A participant costs 1,993,721 HCU on the steady-state path —
    ///      one TWAB lookup at the epoch end, the weight subtraction, the prefix addition, two
    ///      euint128 comparisons, a boolean AND, and the credit select in the reserve — and
    ///      2,963,378 HCU when the boundary cache misses and the opening lookup has to be computed
    ///      too. Against the coprocessor's 20M global ceiling per transaction that is 10 and 6
    ///      respectively.
    ///
    ///      Eight is the hard ceiling: it fits the common path with 20% headroom. Six is what fits
    ///      unconditionally, and the keeper defaults below it and halves on failure, because a batch
    ///      that reverts on HCU costs only gas — the cursor does not move, so retrying smaller is
    ///      always safe. Both numbers come from `test/benchmark.hcu.test.ts` and are reproduced in
    ///      BENCHMARKS.md.
    uint32 public constant MAX_SELECTION_BATCH = 8;

    /// @dev Batch size that stays under the global HCU ceiling even with a cold boundary cache.
    ///      Advisory: the contract accepts anything up to MAX_SELECTION_BATCH.
    uint32 public constant SAFE_SELECTION_BATCH = 5;

    struct Draw {
        DrawState.Status status;
        bool totalVerified;
        bool consistencyVerified;
        bool hasWinner;
        uint64 startTimestamp;
        uint64 endTimestamp;
        uint64 closedTimestamp;
        uint32 participantCount;
        uint32 selectionCursor;
        uint32 randomAttempts;
        uint128 verifiedTotalWeight;
        uint128 randomBound;
        /// @dev Made publicly decryptable at close. The single intentional fairness disclosure.
        euint128 aggregateWeight;
        /// @dev Never publicly decryptable, never granted to a user. Revealing it plus the public
        ///      participant order would identify the winner.
        euint128 randomTarget;
        euint128 prefix;
        ebool pendingAcceptance;
        ebool pendingConsistency;
    }

    /// @dev Cached cumulative at the last epoch boundary this participant was walked to.
    ///      Draws are contiguous, so draw N's end is draw N+1's start and the next draw gets its
    ///      opening lookup for free. This halves the FHE cost of the selection walk in steady state.
    struct BoundaryCheckpoint {
        bool initialized;
        uint64 timestamp;
        euint128 cumulative;
    }

    IERC7984 public immutable confidentialToken;
    ISereinPrizeReserve public immutable prizeReserve;
    uint64 public immutable drawDuration;
    uint64 public immutable genesisTimestamp;

    address[] private _participants;
    mapping(address participant => uint256 indexPlusOne) private _participantIndex;

    mapping(address participant => euint64 balance) private _principal;
    euint64 private _totalPrincipal;

    mapping(address participant => EncryptedTWAB.Series) private _userSeries;
    EncryptedTWAB.Series private _aggregateSeries;
    mapping(address participant => BoundaryCheckpoint) private _boundaryCheckpoint;

    uint256 private _currentDrawId;
    mapping(uint256 drawId => Draw) private _draws;

    uint256 private _reentrancyGuard = 1;

    error UnsupportedToken(address caller);
    error DrawNotYetClosable(uint256 drawId, uint64 endTimestamp, uint64 nowTimestamp);
    error EmptyBatch(uint256 drawId);
    error BatchTooLarge(uint32 requested, uint32 maximum);
    error ConsistencyCheckFailed(uint256 drawId);
    error TotalWeightOutOfBounds(uint128 totalWeight);
    error UnknownDraw(uint256 drawId);
    error Reentrancy();
    error InvalidDrawDuration(uint64 duration);

    modifier nonReentrant() {
        require(_reentrancyGuard == 1, Reentrancy());
        _reentrancyGuard = 2;
        _;
        _reentrancyGuard = 1;
    }

    constructor(IERC7984 confidentialToken_, ISereinPrizeReserve prizeReserve_, uint64 drawDuration_) {
        require(
            drawDuration_ > 0 && drawDuration_ <= Bounds.MAX_EPOCH_SECONDS,
            InvalidDrawDuration(drawDuration_)
        );
        confidentialToken = confidentialToken_;
        prizeReserve = prizeReserve_;
        drawDuration = drawDuration_;
        genesisTimestamp = uint64(block.timestamp);

        _totalPrincipal = FHE.asEuint64(0);
        FHE.allowThis(_totalPrincipal);
        _aggregateSeries.write(genesisTimestamp, _totalPrincipal);

        _currentDrawId = 1;
        _openDraw(1, genesisTimestamp, genesisTimestamp + drawDuration_);
    }

    // ---------------------------------------------------------------------------------------------
    // Saving
    // ---------------------------------------------------------------------------------------------

    /**
     * @notice Receive confidential principal via `IERC7984-confidentialTransferAndCall`.
     *
     * @dev Using the callback rather than an operator approval matters for more than convenience: an
     *      operator grant is a standing permission to move someone's confidential tokens for as long
     *      as it lasts, and the deposit path does not need one. The callback carries the amount that
     *      was *actually* transferred after the token's own clamping, so the pool credits what it
     *      received rather than what was requested.
     *
     *      The returned `ebool` is the bound check from `Bounds`. Returning encrypted false makes the
     *      token refund the sender; the pool credits `select(accepted, amount, 0)` so a rejected
     *      deposit credits nothing and the refund is exact. Manually refunding here *and* returning
     *      false would double-refund, which is why this function never moves tokens itself.
     *
     *      Both ACL grants on the return value are required and neither is optional: the token
     *      checks `isAllowed(retval, address(this))` before using it, and then consumes it in a
     *      `select`, which needs its own allowance.
     */
    function onConfidentialTransferReceived(
        address /* operator */,
        address from,
        euint64 amount,
        bytes calldata /* data */
    ) external override returns (ebool) {
        require(msg.sender == address(confidentialToken), UnsupportedToken(msg.sender));

        // Clamp before adding so the intermediate cannot wrap euint64: an amount above
        // MAX_TOTAL_PRINCIPAL is zeroed, and 2 * MAX_TOTAL_PRINCIPAL is still below 2^64.
        ebool amountWithinBound = FHE.le(amount, Bounds.MAX_TOTAL_PRINCIPAL);
        euint64 safeAmount = FHE.select(amountWithinBound, amount, FHE.asEuint64(0));
        ebool totalWithinBound = FHE.le(
            FHE.add(_totalPrincipal, safeAmount),
            Bounds.MAX_TOTAL_PRINCIPAL
        );
        ebool accepted = FHE.and(amountWithinBound, totalWithinBound);
        euint64 credited = FHE.select(accepted, safeAmount, FHE.asEuint64(0));

        _register(from);
        _applyDelta(from, credited, true);

        FHE.allowThis(accepted);
        FHE.allowTransient(accepted, msg.sender);

        emit SavingsAdded(from, _currentDrawId);
        return accepted;
    }

    /**
     * @notice Take principal back out.
     *
     * @dev Over-withdrawing is not an error. Reverting on "amount exceeds balance" would turn every
     *      failed transaction into a binary-search oracle on a balance the protocol is supposed to
     *      keep private, so the request is clamped to whatever is actually there. The client
     *      validates against a locally revealed balance for a good error message; the contract never
     *      depends on that.
     *
     *      Accounting is reduced by the amount the token reports as actually transferred, not by the
     *      amount requested, so the pool's books cannot drift from its real confidential balance.
     *
     *      This path has no dependency on draw state. Principal remains withdrawable while a draw is
     *      closed, while an aggregate proof is outstanding, mid-selection, and with every keeper
     *      offline.
     */
    function withdraw(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external nonReentrant returns (euint64 transferred) {
        return _withdraw(FHE.fromExternal(encryptedAmount, inputProof));
    }

    /// @notice Withdraw using a handle this contract is already allowed to read.
    function withdraw(euint64 amount) external nonReentrant returns (euint64 transferred) {
        require(FHE.isSenderAllowed(amount), UnsupportedToken(msg.sender));
        return _withdraw(amount);
    }

    function _withdraw(euint64 requested) private returns (euint64 transferred) {
        euint64 balance = _balanceOrZero(msg.sender);
        euint64 desired = FHE.min(requested, balance);

        FHE.allowTransient(desired, address(confidentialToken));
        transferred = confidentialToken.confidentialTransfer(msg.sender, desired);

        _applyDelta(msg.sender, transferred, false);
        emit SavingsWithdrawn(msg.sender, _currentDrawId);
    }

    // ---------------------------------------------------------------------------------------------
    // Draw lifecycle — every function below is permissionless
    // ---------------------------------------------------------------------------------------------

    /**
     * @notice Close the open draw once its scheduled end has passed, and open the next one.
     *
     * @dev The next epoch starts exactly where this one ended, so no interval of time is ever
     *      unaccounted for. If a draw is closed long after its end — a keeper outage, say — the next
     *      epoch is stretched to the first boundary in the future rather than replaying every missed
     *      period. Weight is an integral, so a longer epoch is still exact; replaying hundreds of
     *      tiny draws to catch up would not be.
     *
     *      Marking the aggregate publicly decryptable is irreversible. It is applied to exactly one
     *      handle per draw, after that draw's interval is frozen, and to nothing else.
     */
    function closeDraw() external returns (uint256 closedDrawId) {
        closedDrawId = _currentDrawId;
        Draw storage draw = _draws[closedDrawId];
        DrawState.require_(draw.status, DrawState.Status.Open, closedDrawId);
        require(
            block.timestamp >= draw.endTimestamp,
            DrawNotYetClosable(closedDrawId, draw.endTimestamp, uint64(block.timestamp))
        );

        draw.participantCount = uint32(_participants.length);
        draw.closedTimestamp = uint64(block.timestamp);

        euint128 aggregate = _aggregateSeries.weightBetween(draw.startTimestamp, draw.endTimestamp);
        FHE.allowThis(aggregate);
        FHE.makePubliclyDecryptable(aggregate);
        draw.aggregateWeight = aggregate;

        euint128 zero = FHE.asEuint128(0);
        FHE.allowThis(zero);
        draw.prefix = zero;

        draw.status = DrawState.Status.AwaitingTotalProof;
        prizeReserve.freezePrize(closedDrawId);

        emit DrawClosed(closedDrawId, draw.participantCount, euint128.unwrap(aggregate));

        uint64 nextStart = draw.endTimestamp;
        uint64 nextEnd = nextStart + drawDuration;
        if (nextEnd <= block.timestamp) {
            uint64 periods = (uint64(block.timestamp) - nextStart) / drawDuration + 1;
            uint64 span = periods * drawDuration;
            nextEnd = nextStart + (span > Bounds.MAX_EPOCH_SECONDS ? Bounds.MAX_EPOCH_SECONDS : span);
        }
        _currentDrawId = closedDrawId + 1;
        _openDraw(closedDrawId + 1, nextStart, nextEnd);
    }

    /**
     * @notice Submit the KMS-signed cleartext of a closed draw's aggregate weight.
     *
     * @dev Anyone can call this, because the value is one that everyone is allowed to read. The
     *      caller supplies a number and a proof; `FHE.checkSignatures` reverts unless the KMS
     *      actually signed that number for *this* draw's handle. A forged total, a total lifted from
     *      another draw, and a replay of an already-accepted submission all fail — the first two on
     *      the signature check, the third on the state machine.
     *
     *      A verified total of zero means nobody held a balance during any part of the epoch. There
     *      is nothing to sample and `nextPowerOfTwo(0)` is undefined, so the draw finalizes with no
     *      winner and the prize stays in the reserve.
     */
    function submitTotalProof(
        uint256 drawId,
        uint128 totalWeight,
        bytes calldata decryptionProof
    ) external {
        Draw storage draw = _draws[drawId];
        DrawState.require_(draw.status, DrawState.Status.AwaitingTotalProof, drawId);

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = euint128.unwrap(draw.aggregateWeight);
        FHE.checkSignatures(handles, abi.encode(totalWeight), decryptionProof);

        draw.verifiedTotalWeight = totalWeight;
        draw.totalVerified = true;

        if (totalWeight == 0) {
            draw.consistencyVerified = true;
            draw.hasWinner = false;
            draw.status = DrawState.Status.Finalized;
            emit TotalWeightVerified(drawId, 0, 0);
            emit DrawFinalized(drawId, true, false);
            return;
        }

        require(totalWeight <= Bounds.MAX_DRAW_WEIGHT, TotalWeightOutOfBounds(totalWeight));
        uint128 bound = Bounds.nextPowerOfTwo(totalWeight);
        draw.randomBound = bound;
        draw.status = DrawState.Status.AwaitingRandomCandidate;

        emit TotalWeightVerified(drawId, totalWeight, bound);
    }

    /**
     * @notice Draw a fresh encrypted random candidate for a draw whose total is verified.
     *
     * @dev Only the acceptance boolean is published. The candidate itself is stored as a ciphertext
     *      that is never marked publicly decryptable and never granted to any address.
     */
    function generateRandomCandidate(uint256 drawId) external {
        Draw storage draw = _draws[drawId];
        DrawState.require_(draw.status, DrawState.Status.AwaitingRandomCandidate, drawId);

        draw.randomAttempts += 1;
        euint128 candidate = ExactWeightedRandom.drawCandidate(draw.randomBound);
        ebool accepted = ExactWeightedRandom.acceptancePredicate(candidate, draw.verifiedTotalWeight);
        FHE.makePubliclyDecryptable(accepted);

        draw.randomTarget = candidate;
        draw.pendingAcceptance = accepted;
        draw.status = DrawState.Status.AwaitingAcceptanceProof;

        emit RandomCandidateGenerated(drawId, draw.randomAttempts, ebool.unwrap(accepted));
    }

    /**
     * @notice Submit the KMS-signed result of the acceptance test.
     *
     * @dev A rejected candidate is erased rather than kept around, so there is no stored handle a
     *      later call could resurrect. The fresh candidate drawn on the next attempt is independent,
     *      which is what keeps the conditional distribution uniform.
     */
    function submitAcceptanceProof(
        uint256 drawId,
        bool accepted,
        bytes calldata decryptionProof
    ) external {
        Draw storage draw = _draws[drawId];
        DrawState.require_(draw.status, DrawState.Status.AwaitingAcceptanceProof, drawId);

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = ebool.unwrap(draw.pendingAcceptance);
        FHE.checkSignatures(handles, abi.encode(accepted), decryptionProof);

        draw.pendingAcceptance = ebool.wrap(0);

        if (accepted) {
            draw.status = DrawState.Status.Selecting;
            emit RandomCandidateAccepted(drawId, draw.randomAttempts);
        } else {
            draw.randomTarget = euint128.wrap(0);
            draw.status = DrawState.Status.AwaitingRandomCandidate;
            emit RandomCandidateRejected(drawId, draw.randomAttempts);
        }
    }

    /**
     * @notice Walk up to `count` participants, assigning each their encrypted prize credit.
     *
     * @dev The walk is the HCU-bounded part of a draw, which is why it is batched and why the cursor
     *      lives in storage. A batch that reverts — gas, HCU, a bad RPC — advances nothing, so
     *      retrying is always safe and never double-processes anyone.
     *
     *      Each participant is visited exactly once because the cursor only moves forward and every
     *      batch starts where the last one stopped. There is no way to skip a range, revisit one, or
     *      reorder the walk: the order is the public registry order, fixed when the draw closed.
     */
    function processSelectionBatch(uint256 drawId, uint32 count) external {
        Draw storage draw = _draws[drawId];
        DrawState.require_(draw.status, DrawState.Status.Selecting, drawId);
        require(count > 0 && count <= MAX_SELECTION_BATCH, BatchTooLarge(count, MAX_SELECTION_BATCH));

        uint32 from = draw.selectionCursor;
        uint32 to = from + count;
        if (to > draw.participantCount) to = draw.participantCount;
        require(to > from, EmptyBatch(drawId));

        euint128 prefix = draw.prefix;
        euint128 target = draw.randomTarget;
        uint64 start = draw.startTimestamp;
        uint64 end = draw.endTimestamp;

        for (uint32 i = from; i < to; ++i) {
            address participant = _participants[i];
            euint128 weight = _epochWeight(participant, start, end);
            (ebool isWinner, euint128 nextPrefix) = ExactWeightedRandom.winnerPredicate(
                target,
                prefix,
                weight
            );
            prefix = nextPrefix;

            FHE.allowTransient(isWinner, address(prizeReserve));
            prizeReserve.creditParticipant(drawId, participant, isWinner);
        }

        FHE.allowThis(prefix);
        draw.prefix = prefix;
        draw.selectionCursor = to;
        emit SelectionBatchProcessed(drawId, from, to);

        if (to == draw.participantCount) {
            ebool consistent = ExactWeightedRandom.consistencyPredicate(
                prefix,
                draw.verifiedTotalWeight
            );
            FHE.makePubliclyDecryptable(consistent);
            draw.pendingConsistency = consistent;
            draw.status = DrawState.Status.AwaitingConsistencyProof;
            emit ConsistencyRequested(drawId, ebool.unwrap(consistent));
        }
    }

    /**
     * @notice Submit the KMS-signed result of the prefix-versus-aggregate check, finalizing the draw.
     *
     * @dev The walk accumulates each participant's weight into a running prefix, so the final prefix
     *      has to equal the aggregate the KMS already proved. A mismatch would mean the aggregate
     *      series and the individual series disagree, which is a bug, and the draw stays unfinalized
     *      until someone looks at it. Nothing is at risk while it sits there: principal is untouched,
     *      the prize stays in the reserve, and claims require a finalized draw.
     *
     *      This gate detects rather than prevents. Payment safety comes from the intervals tiling
     *      [0, P) with no overlap and the target being below T, so at most one participant can match
     *      whatever P turns out to be.
     */
    function submitConsistencyProof(
        uint256 drawId,
        bool consistent,
        bytes calldata decryptionProof
    ) external {
        Draw storage draw = _draws[drawId];
        DrawState.require_(draw.status, DrawState.Status.AwaitingConsistencyProof, drawId);

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = ebool.unwrap(draw.pendingConsistency);
        FHE.checkSignatures(handles, abi.encode(consistent), decryptionProof);

        require(consistent, ConsistencyCheckFailed(drawId));

        draw.pendingConsistency = ebool.wrap(0);
        draw.consistencyVerified = true;
        draw.hasWinner = true;
        draw.status = DrawState.Status.Finalized;

        emit DrawFinalized(drawId, true, true);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    function confidentialBalanceOf(address account) external view returns (euint64) {
        return _principal[account];
    }

    function confidentialTotalPrincipal() external view returns (euint64) {
        return _totalPrincipal;
    }

    function confidentialAggregateWeight(uint256 drawId) external view returns (euint128) {
        return _draws[drawId].aggregateWeight;
    }

    /**
     * @notice Every ciphertext handle a draw holds, for the proof view and for adversarial tests.
     *
     * @dev Publishing handles is not publishing values. Contract storage is readable by anyone, so
     *      these are already visible; what decides whether a handle can become a number is the ACL,
     *      and only `aggregateWeight` and the two verification booleans are ever marked publicly
     *      decryptable. `randomTarget` and `prefix` are granted to this contract and to nothing else,
     *      which is what the proof view invites a sceptical reader to confirm for themselves: take
     *      the random target's handle, ask the relayer to decrypt it, and be refused.
     */
    function drawHandles(
        uint256 drawId
    )
        external
        view
        returns (
            euint128 aggregateWeight,
            euint128 randomTarget,
            euint128 prefix,
            ebool pendingAcceptance,
            ebool pendingConsistency
        )
    {
        Draw storage draw = _draws[drawId];
        return (
            draw.aggregateWeight,
            draw.randomTarget,
            draw.prefix,
            draw.pendingAcceptance,
            draw.pendingConsistency
        );
    }

    function participantCount() external view returns (uint256) {
        return _participants.length;
    }

    function participantAt(uint256 index) external view returns (address) {
        return _participants[index];
    }

    function participantsSlice(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory page) {
        uint256 total = _participants.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) page[i - offset] = _participants[i];
    }

    function isRegistered(address account) external view returns (bool) {
        return _participantIndex[account] != 0;
    }

    function currentDrawId() external view returns (uint256) {
        return _currentDrawId;
    }

    function drawStatus(uint256 drawId) external view returns (DrawState.Status) {
        return _draws[drawId].status;
    }

    function getDraw(uint256 drawId) external view returns (DrawView memory) {
        Draw storage draw = _draws[drawId];
        require(draw.status != DrawState.Status.None, UnknownDraw(drawId));
        return
            DrawView({
                status: draw.status,
                startTimestamp: draw.startTimestamp,
                endTimestamp: draw.endTimestamp,
                closedTimestamp: draw.closedTimestamp,
                participantCount: draw.participantCount,
                selectionCursor: draw.selectionCursor,
                randomAttempts: draw.randomAttempts,
                verifiedTotalWeight: draw.verifiedTotalWeight,
                randomBound: draw.randomBound,
                totalVerified: draw.totalVerified,
                consistencyVerified: draw.consistencyVerified,
                hasWinner: draw.hasWinner
            });
    }

    /// @notice Number of TWAB observations recorded for `account`. Exposes no encrypted value.
    function observationCount(address account) external view returns (uint256) {
        return _userSeries[account].length();
    }

    function aggregateObservationCount() external view returns (uint256) {
        return _aggregateSeries.length();
    }

    /**
     * @notice One TWAB observation, as a public timestamp plus two ciphertext handles.
     *
     * @dev Returning handles discloses nothing. A handle is a pointer, contract storage is readable
     *      by anyone regardless, and turning one into a number requires an ACL grant that historical
     *      observations never carry. The proof view uses this to show that individual history really
     *      is encrypted — a reader can take the handle, attempt to decrypt it, and be refused.
     */
    function observationAt(
        address account,
        uint256 index
    ) external view returns (uint64 timestamp, euint64 balance, euint128 cumulative) {
        return _userSeries[account].observationAt(index);
    }

    function aggregateObservationAt(
        uint256 index
    ) external view returns (uint64 timestamp, euint64 balance, euint128 cumulative) {
        return _aggregateSeries.observationAt(index);
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    function _openDraw(uint256 drawId, uint64 start, uint64 end) private {
        Draw storage draw = _draws[drawId];
        draw.status = DrawState.Status.Open;
        draw.startTimestamp = start;
        draw.endTimestamp = end;
        emit DrawOpened(drawId, start, end);
    }

    function _register(address participant) private {
        if (_participantIndex[participant] != 0) return;
        _participants.push(participant);
        _participantIndex[participant] = _participants.length;
        emit ParticipantRegistered(participant, _participants.length - 1);
    }

    /**
     * @dev Apply an encrypted balance change and record it in both the participant's series and the
     *      aggregate series at the same timestamp.
     *
     *      Writing both at the same instant is what makes the aggregate exactly the sum of the
     *      individuals: the aggregate balance function is the pointwise sum of the individual balance
     *      functions, and integration is linear. That identity is the reason a single published
     *      aggregate is enough to run an exact draw without publishing anything individual.
     */
    function _applyDelta(address participant, euint64 delta, bool increase) private {
        euint64 balance = _balanceOrZero(participant);
        euint64 newBalance = increase ? FHE.add(balance, delta) : FHE.sub(balance, delta);
        euint64 newTotal = increase
            ? FHE.add(_totalPrincipal, delta)
            : FHE.sub(_totalPrincipal, delta);

        FHE.allowThis(newBalance);
        FHE.allow(newBalance, participant);
        FHE.allowThis(newTotal);

        _principal[participant] = newBalance;
        _totalPrincipal = newTotal;

        uint64 nowTimestamp = uint64(block.timestamp);
        _userSeries[participant].write(nowTimestamp, newBalance);
        _aggregateSeries.write(nowTimestamp, newTotal);
    }

    function _balanceOrZero(address participant) private returns (euint64) {
        euint64 balance = _principal[participant];
        if (!FHE.isInitialized(balance)) {
            balance = FHE.asEuint64(0);
            FHE.allowThis(balance);
        }
        return balance;
    }

    /**
     * @dev Weight of one participant across a frozen epoch, using the boundary cache when the epoch
     *      starts exactly where this participant was last walked to.
     */
    function _epochWeight(
        address participant,
        uint64 start,
        uint64 end
    ) private returns (euint128) {
        EncryptedTWAB.Series storage series = _userSeries[participant];
        BoundaryCheckpoint storage checkpoint = _boundaryCheckpoint[participant];

        euint128 cumulativeStart = (checkpoint.initialized && checkpoint.timestamp == start)
            ? checkpoint.cumulative
            : series.cumulativeAt(start);

        euint128 cumulativeEnd = series.cumulativeAt(end);
        FHE.allowThis(cumulativeEnd);

        checkpoint.initialized = true;
        checkpoint.timestamp = end;
        checkpoint.cumulative = cumulativeEnd;

        euint128 weight = FHE.sub(cumulativeEnd, cumulativeStart);
        FHE.allowThis(weight);
        return weight;
    }
}
