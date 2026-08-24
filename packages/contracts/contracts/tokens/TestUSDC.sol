// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TestUSDC
 * @notice Six-decimal test token with a public faucet, so a reviewer can complete the whole Serein
 *         cycle from a fresh wallet without a private RPC, a DM, or an allowlist.
 *
 * @dev Zama does not publish a Sepolia ERC-20 / ERC-7984 pair with an open faucet that a first-time
 *      visitor can mint from in one click, so Serein ships its own pair rather than sending judges
 *      hunting for test liquidity. It carries no value and says so in its name.
 *
 *      The faucet is rate-limited per address. Not because anything here is worth farming, but
 *      because an unlimited mint would let one address inflate the pool's aggregate weight until the
 *      other savers' odds round to nothing, which would make a live demo look broken.
 */
contract TestUSDC is ERC20 {
    uint8 private constant DECIMALS = 6;

    /// @dev 1,000 test USDC per claim.
    uint256 public constant FAUCET_AMOUNT = 1_000 * 10 ** uint256(DECIMALS);

    /// @dev Minimum gap between claims from the same address.
    uint256 public constant FAUCET_COOLDOWN = 4 hours;

    /// @dev Ceiling on what any one address can ever mint from the faucet.
    uint256 public constant FAUCET_LIFETIME_CAP = 50_000 * 10 ** uint256(DECIMALS);

    mapping(address account => uint256 timestamp) public lastClaimedAt;
    mapping(address account => uint256 amount) public totalClaimed;

    event FaucetClaimed(address indexed account, uint256 amount);

    error FaucetCooldownActive(address account, uint256 availableAt);
    error FaucetLifetimeCapReached(address account, uint256 claimed, uint256 cap);

    constructor() ERC20("Serein Test USDC", "tUSDC") {}

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Mint `FAUCET_AMOUNT` to the caller, subject to the cooldown and lifetime cap.
    function claim() external {
        _claimTo(msg.sender);
    }

    /// @notice Mint to `recipient`, so a relayer can fund a wallet that has no Sepolia ETH yet.
    function claimTo(address recipient) external {
        _claimTo(recipient);
    }

    /// @notice Seconds until `account` may claim again. Zero when a claim is available now.
    function faucetCooldownRemaining(address account) external view returns (uint256) {
        uint256 availableAt = lastClaimedAt[account] + FAUCET_COOLDOWN;
        return block.timestamp >= availableAt ? 0 : availableAt - block.timestamp;
    }

    function faucetRemainingAllowance(address account) external view returns (uint256) {
        uint256 claimed = totalClaimed[account];
        return claimed >= FAUCET_LIFETIME_CAP ? 0 : FAUCET_LIFETIME_CAP - claimed;
    }

    function _claimTo(address recipient) private {
        uint256 availableAt = lastClaimedAt[recipient] + FAUCET_COOLDOWN;
        require(
            lastClaimedAt[recipient] == 0 || block.timestamp >= availableAt,
            FaucetCooldownActive(recipient, availableAt)
        );

        uint256 claimed = totalClaimed[recipient];
        require(
            claimed + FAUCET_AMOUNT <= FAUCET_LIFETIME_CAP,
            FaucetLifetimeCapReached(recipient, claimed, FAUCET_LIFETIME_CAP)
        );

        lastClaimedAt[recipient] = block.timestamp;
        totalClaimed[recipient] = claimed + FAUCET_AMOUNT;
        _mint(recipient, FAUCET_AMOUNT);

        emit FaucetClaimed(recipient, FAUCET_AMOUNT);
    }
}
