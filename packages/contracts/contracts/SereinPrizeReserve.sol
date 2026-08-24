// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ISereinPool} from "./interfaces/ISereinPool.sol";
import {ISereinPrizeReserve} from "./interfaces/ISereinPrizeReserve.sol";
import {DrawState} from "./libraries/DrawState.sol";

/**
 * @title SereinPrizeReserve
 * @notice Holds prize funds and pays them out. Holds no principal, ever.
 *
 * @dev This contract is the other half of the no-loss guarantee. It has its own confidential token
 *      balance, entirely separate from the pool's, and there is no function here that can move the
 *      pool's tokens — not for an owner, not for the pool, not for anyone. Conversely the pool
 *      cannot spend from here: all it can do is tell the reserve who won, as an encrypted boolean it
 *      cannot itself read the answer to.
 *
 *      Prize funds only ever arrive through the ERC-7984 receiver callback, which means the reserve
 *      credits the amount that actually landed rather than an amount somebody claimed to send. Each
 *      draw's allocation is frozen when that draw closes, so money added later cannot retroactively
 *      change a draw already in flight.
 *
 *      Payout conservation is structural rather than checked. The selection walk produces at most
 *      one true winner predicate per draw, because the prefix intervals partition the weight range
 *      and the random target is a single point inside it. Every other participant's credit is
 *      `select(false, prize, 0)`, an encrypted zero. So the reserve can pay out at most the prize it
 *      was funded, whatever order people claim in and however many non-participants call `claim`.
 */
contract SereinPrizeReserve is ISereinPrizeReserve, IERC7984Receiver, Ownable, ZamaEthereumConfig {
    IERC7984 public immutable confidentialToken;

    ISereinPool public pool;
    address public prizeSource;
    bool public initialized;

    mapping(uint256 drawId => euint64 prize) private _drawPrize;
    mapping(uint256 drawId => bool) private _prizeFrozen;
    mapping(uint256 drawId => mapping(address participant => euint64 credit)) private _credit;
    mapping(uint256 drawId => mapping(address participant => bool)) private _credited;
    mapping(uint256 drawId => mapping(address participant => bool)) private _claimed;

    error AlreadyInitialized();
    error NotInitialized();
    error OnlyPool(address caller);
    error UnsupportedToken(address caller);
    error PrizeAlreadyFrozen(uint256 drawId);
    error PrizeNotFrozen(uint256 drawId);
    error ParticipantAlreadyCredited(uint256 drawId, address participant);
    error DrawNotFinalized(uint256 drawId);
    error AlreadyClaimed(uint256 drawId, address participant);
    error ZeroAddress();

    modifier onlyPool() {
        require(msg.sender == address(pool), OnlyPool(msg.sender));
        _;
    }

    constructor(IERC7984 confidentialToken_, address owner_) Ownable(owner_) {
        require(address(confidentialToken_) != address(0), ZeroAddress());
        confidentialToken = confidentialToken_;
    }

    /**
     * @notice Bind the reserve to its pool and prize source. Callable once.
     *
     * @dev The pool needs the reserve's address at construction and the reserve needs the pool's, so
     *      one of the two has to be wired after the fact. Making it single-shot and permanent means
     *      the binding is as good as immutable from the first transaction onward — an owner cannot
     *      later repoint the reserve at a pool that would credit differently.
     */
    function initialize(ISereinPool pool_, address prizeSource_) external onlyOwner {
        require(!initialized, AlreadyInitialized());
        require(address(pool_) != address(0) && prizeSource_ != address(0), ZeroAddress());
        pool = pool_;
        prizeSource = prizeSource_;
        initialized = true;
    }

    // ---------------------------------------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------------------------------------

    /**
     * @notice Receive prize funding for a specific draw.
     *
     * @dev `data` carries the draw id. The callback is accepted only from the configured prize
     *      source and only while that draw's allocation is still open; anything else returns an
     *      encrypted false, which makes the token refund the sender rather than leaving stranded
     *      value here.
     */
    function onConfidentialTransferReceived(
        address /* operator */,
        address from,
        euint64 amount,
        bytes calldata data
    ) external override returns (ebool) {
        require(msg.sender == address(confidentialToken), UnsupportedToken(msg.sender));
        require(initialized, NotInitialized());

        bool acceptable = from == prizeSource && data.length == 32;
        uint256 drawId = acceptable ? abi.decode(data, (uint256)) : 0;
        acceptable = acceptable && !_prizeFrozen[drawId];

        ebool accepted = FHE.asEbool(acceptable);

        if (acceptable) {
            euint64 existing = _drawPrize[drawId];
            euint64 updated = FHE.isInitialized(existing) ? FHE.add(existing, amount) : amount;
            FHE.allowThis(updated);
            _drawPrize[drawId] = updated;
            emit PrizeFunded(drawId, from, euint64.unwrap(updated));
        }

        FHE.allowThis(accepted);
        FHE.allowTransient(accepted, msg.sender);
        return accepted;
    }

    /// @inheritdoc ISereinPrizeReserve
    function freezePrize(uint256 drawId) external onlyPool {
        require(!_prizeFrozen[drawId], PrizeAlreadyFrozen(drawId));
        _prizeFrozen[drawId] = true;
        emit PrizeFrozen(drawId, euint64.unwrap(_drawPrize[drawId]));
    }

    // ---------------------------------------------------------------------------------------------
    // Crediting and claiming
    // ---------------------------------------------------------------------------------------------

    /**
     * @notice Materialise one participant's encrypted credit from their winner predicate.
     *
     * @dev The reserve never learns who won. It applies `select(isWinner, prize, 0)` to a boolean it
     *      cannot read and stores the result, granting read access to the participant alone so they
     *      can reveal their own outcome and to nobody else.
     *
     *      Credits are written once per participant per draw. The pool's cursor already guarantees a
     *      single visit; this check makes that guarantee local rather than inherited, so a bug on the
     *      other side of the call cannot turn into a double credit here.
     */
    function creditParticipant(
        uint256 drawId,
        address participant,
        ebool isWinner
    ) external onlyPool {
        require(_prizeFrozen[drawId], PrizeNotFrozen(drawId));
        require(!_credited[drawId][participant], ParticipantAlreadyCredited(drawId, participant));
        _credited[drawId][participant] = true;

        euint64 prize = _drawPrize[drawId];
        if (!FHE.isInitialized(prize)) prize = FHE.asEuint64(0);

        euint64 credit = FHE.select(isWinner, prize, FHE.asEuint64(0));
        FHE.allowThis(credit);
        FHE.allow(credit, participant);
        _credit[drawId][participant] = credit;

        emit ParticipantCredited(drawId, participant);
    }

    /**
     * @notice Collect the result of a finalized draw.
     *
     * @dev Anyone may call this, winner or not, participant or not. A non-winner's credit is an
     *      encrypted zero, so the transaction is indistinguishable from a winner's: same function,
     *      same event, same shape on the explorer. That is deliberate. If only winners could
     *      profitably claim, the act of claiming would announce the outcome and undo the work of
     *      keeping it encrypted.
     */
    function claim(uint256 drawId) external returns (euint64 transferred) {
        require(initialized, NotInitialized());
        require(
            pool.drawStatus(drawId) == DrawState.Status.Finalized,
            DrawNotFinalized(drawId)
        );
        require(!_claimed[drawId][msg.sender], AlreadyClaimed(drawId, msg.sender));
        _claimed[drawId][msg.sender] = true;

        euint64 credit = _credit[drawId][msg.sender];
        if (!FHE.isInitialized(credit)) {
            credit = FHE.asEuint64(0);
            FHE.allowThis(credit);
        }

        FHE.allowTransient(credit, address(confidentialToken));
        transferred = confidentialToken.confidentialTransfer(msg.sender, credit);

        emit PrizeClaimed(drawId, msg.sender);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    function confidentialPrizeOf(uint256 drawId) external view returns (euint64) {
        return _drawPrize[drawId];
    }

    function confidentialCreditOf(
        uint256 drawId,
        address participant
    ) external view returns (euint64) {
        return _credit[drawId][participant];
    }

    function confidentialReserveBalance() external view returns (euint64) {
        return confidentialToken.confidentialBalanceOf(address(this));
    }

    function isPrizeFrozen(uint256 drawId) external view returns (bool) {
        return _prizeFrozen[drawId];
    }

    function hasClaimed(uint256 drawId, address participant) external view returns (bool) {
        return _claimed[drawId][participant];
    }

    function isCredited(uint256 drawId, address participant) external view returns (bool) {
        return _credited[drawId][participant];
    }
}
