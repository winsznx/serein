// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title DrawState
 * @notice The draw lifecycle, with one state per asynchronous boundary.
 *
 * @dev A draw cannot run inside a single transaction. Three of its steps depend on a value that only
 *      the Zama KMS can produce, and each of those is a place where execution stops, waits for an
 *      off-chain round trip, and resumes when somebody submits the signed result. A fourth boundary
 *      is the HCU ceiling, which forces the per-participant walk into batches.
 *
 *      Every one of those pauses is a state here rather than an implicit assumption, which is what
 *      makes a draw resumable. A keeper that dies mid-draw, a browser tab that closes, a rate-limited
 *      RPC, or a reverted batch all leave the draw sitting in a well-defined state that any address
 *      can pick up and continue. Nothing about progression is privileged.
 *
 *      Transitions are monotonic with exactly one exception: a rejected random candidate returns to
 *      `AwaitingRandomCandidate` so a fresh one can be drawn. That is the rejection-sampling loop,
 *      and the attempt counter is public so the transcript is auditable.
 *
 *            Open
 *              | closeDraw()                       epoch elapsed; aggregate weight frozen and
 *              v                                   marked publicly decryptable
 *            AwaitingTotalProof
 *              | submitTotalProof()                KMS-signed cleartext verified on chain
 *              v
 *            AwaitingRandomCandidate  <------+
 *              | generateRandomCandidate()   |
 *              v                             |
 *            AwaitingAcceptanceProof         | rejected: candidate discarded, attempts += 1
 *              | submitAcceptanceProof() ----+
 *              v accepted: target locked forever
 *            Selecting
 *              | processSelectionBatch() until the cursor reaches the frozen participant count
 *              v
 *            AwaitingConsistencyProof
 *              | submitConsistencyProof()
 *              v
 *            Finalized
 *
 *      A draw whose aggregate weight verifies as zero — nobody held a balance for any part of the
 *      epoch — skips straight from `AwaitingTotalProof` to `Finalized` with no winner. There is
 *      nothing to sample from, and `nextPowerOfTwo(0)` is undefined.
 */
library DrawState {
    enum Status {
        None,
        Open,
        AwaitingTotalProof,
        AwaitingRandomCandidate,
        AwaitingAcceptanceProof,
        Selecting,
        AwaitingConsistencyProof,
        Finalized
    }

    error UnexpectedDrawStatus(uint256 drawId, Status actual, Status expected);

    function require_(Status actual, Status expected, uint256 drawId) internal pure {
        if (actual != expected) revert UnexpectedDrawStatus(drawId, actual, expected);
    }
}
