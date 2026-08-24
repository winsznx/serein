// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";

interface ISereinPrizeReserve {
    event PrizeFunded(uint256 indexed drawId, address indexed source, bytes32 prizeHandle);
    event PrizeFrozen(uint256 indexed drawId, bytes32 prizeHandle);
    event ParticipantCredited(uint256 indexed drawId, address indexed participant);
    event PrizeClaimed(uint256 indexed drawId, address indexed participant);

    /// @notice Encrypted prize allocated to `drawId`. Never publicly decryptable.
    function confidentialPrizeOf(uint256 drawId) external view returns (euint64);

    /// @notice Encrypted credit owed to `participant` for `drawId`. Readable by that participant.
    function confidentialCreditOf(
        uint256 drawId,
        address participant
    ) external view returns (euint64);

    function isPrizeFrozen(uint256 drawId) external view returns (bool);

    function hasClaimed(uint256 drawId, address participant) external view returns (bool);

    function isCredited(uint256 drawId, address participant) external view returns (bool);

    /**
     * @notice Freeze the prize for `drawId` so later funding cannot change a draw already in flight.
     * @dev Callable only by the pool, at draw close.
     */
    function freezePrize(uint256 drawId) external;

    /**
     * @notice Record the encrypted winner predicate for one participant and materialise their credit.
     * @dev Callable only by the pool, during the selection walk. `isWinner` must be granted to this
     *      contract transiently by the caller.
     */
    function creditParticipant(uint256 drawId, address participant, ebool isWinner) external;

    /**
     * @notice Collect the result of a finalized draw.
     * @dev Every participant may call this. A non-winner transfers an encrypted zero, so calling it
     *      reveals participation but not outcome.
     */
    function claim(uint256 drawId) external returns (euint64 transferred);
}
