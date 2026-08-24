// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {euint64, euint128} from "@fhevm/solidity/lib/FHE.sol";

import {DrawState} from "../libraries/DrawState.sol";

interface ISereinPool {
    struct DrawView {
        DrawState.Status status;
        uint64 startTimestamp;
        uint64 endTimestamp;
        uint64 closedTimestamp;
        uint32 participantCount;
        uint32 selectionCursor;
        uint32 randomAttempts;
        uint128 verifiedTotalWeight;
        uint128 randomBound;
        bool totalVerified;
        bool consistencyVerified;
        bool hasWinner;
    }

    event ParticipantRegistered(address indexed participant, uint256 indexed index);
    event SavingsAdded(address indexed participant, uint256 indexed drawId);
    event SavingsWithdrawn(address indexed participant, uint256 indexed drawId);
    event DepositRejected(address indexed participant, string reason);

    event DrawOpened(uint256 indexed drawId, uint64 startTimestamp, uint64 endTimestamp);
    event DrawClosed(uint256 indexed drawId, uint32 participantCount, bytes32 aggregateWeightHandle);
    event TotalWeightVerified(uint256 indexed drawId, uint128 totalWeight, uint128 randomBound);
    event RandomCandidateGenerated(uint256 indexed drawId, uint32 attempt, bytes32 acceptanceHandle);
    event RandomCandidateRejected(uint256 indexed drawId, uint32 attempt);
    event RandomCandidateAccepted(uint256 indexed drawId, uint32 attempt);
    event SelectionBatchProcessed(uint256 indexed drawId, uint32 fromIndex, uint32 toIndex);
    event ConsistencyRequested(uint256 indexed drawId, bytes32 consistencyHandle);
    event DrawFinalized(uint256 indexed drawId, bool consistencyVerified, bool hasWinner);

    /// @notice Encrypted principal of `account`. Readable only by `account` and this contract.
    function confidentialBalanceOf(address account) external view returns (euint64);

    /// @notice Encrypted sum of all principal. Never made publicly decryptable.
    function confidentialTotalPrincipal() external view returns (euint64);

    function participantCount() external view returns (uint256);

    function participantAt(uint256 index) external view returns (address);

    function isRegistered(address account) external view returns (bool);

    function currentDrawId() external view returns (uint256);

    function drawStatus(uint256 drawId) external view returns (DrawState.Status);

    function getDraw(uint256 drawId) external view returns (DrawView memory);

    /// @notice Encrypted aggregate weight of a closed draw, before public verification.
    function confidentialAggregateWeight(uint256 drawId) external view returns (euint128);
}
