// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/interfaces/IERC7984ERC20Wrapper.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IPrizeSource} from "./interfaces/IPrizeSource.sol";

/**
 * @title MockPrizeSource
 * @notice The Sepolia stand-in for yield. It is a funded reserve, not a strategy, and Serein says so
 *         everywhere it appears.
 *
 * @dev There is no real confidential-yield venue on Sepolia to route savings through, so inventing
 *      one would mean either a fake integration or a fake APY. Serein does neither. This contract
 *      does exactly one honest thing: an operator puts test tokens in, and those tokens become the
 *      prize for a specific draw. `IPrizeSource` is the seam a real adapter would occupy later
 *      without touching principal accounting or the draw algorithm.
 *
 *      Two disclosure facts, both stated in PRIVACY.md rather than glossed over:
 *
 *        - `deposit` crosses the transparent ERC-20 boundary, so the total amount ever wrapped into
 *          this contract is public;
 *        - `fundDraw` takes an *encrypted* amount, so how that total is split between draws is not.
 *
 *      The operator's authority begins and ends with adding money. There is no function here — and
 *      none in the reserve reachable from here — that touches a saver's principal or influences who
 *      wins.
 */
contract MockPrizeSource is IPrizeSource, Ownable, ZamaEthereumConfig {
    using SafeERC20 for IERC20;

    IERC20 public immutable underlying;
    IERC7984ERC20Wrapper public immutable wrapper;
    address public immutable reserve;

    event PrizeSourceFunded(address indexed operator, uint256 underlyingAmount);

    error ZeroAddress();
    error ZeroAmount();

    constructor(
        IERC7984ERC20Wrapper wrapper_,
        address reserve_,
        address owner_
    ) Ownable(owner_) {
        require(address(wrapper_) != address(0) && reserve_ != address(0), ZeroAddress());
        wrapper = wrapper_;
        reserve = reserve_;
        underlying = IERC20(wrapper_.underlying());
    }

    function confidentialToken() external view returns (address) {
        return address(wrapper);
    }

    function prizeReserve() external view returns (address) {
        return reserve;
    }

    /**
     * @notice Wrap test ERC-20 into this contract's confidential balance.
     * @dev The caller must have approved `underlying` to this contract first. The amount is public;
     *      that is inherent to the transparent-token boundary, not a design choice.
     */
    function deposit(uint256 underlyingAmount) external onlyOwner {
        require(underlyingAmount > 0, ZeroAmount());
        underlying.safeTransferFrom(msg.sender, address(this), underlyingAmount);
        underlying.forceApprove(address(wrapper), underlyingAmount);
        wrapper.wrap(address(this), underlyingAmount);
        emit PrizeSourceFunded(msg.sender, underlyingAmount);
    }

    /**
     * @notice Allocate an encrypted amount of the held balance to `drawId`.
     *
     * @dev Sent through `confidentialTransferAndCall` so the reserve credits the amount that
     *      actually moved after the token's own clamping, rather than an amount this contract
     *      asserted. If the reserve rejects the transfer — the draw's allocation is already frozen,
     *      say — the token refunds it here rather than stranding the value.
     */
    function fundDraw(
        uint256 drawId,
        externalEuint64 amount,
        bytes calldata inputProof
    ) external onlyOwner {
        euint64 requested = FHE.fromExternal(amount, inputProof);
        FHE.allowTransient(requested, address(wrapper));
        IERC7984(address(wrapper)).confidentialTransferAndCall(
            reserve,
            requested,
            abi.encode(drawId)
        );
        emit DrawFunded(drawId, euint64.unwrap(requested));
    }

    /// @notice Encrypted balance this source still holds, unallocated to any draw.
    function confidentialBalance() external view returns (euint64) {
        return IERC7984(address(wrapper)).confidentialBalanceOf(address(this));
    }
}
