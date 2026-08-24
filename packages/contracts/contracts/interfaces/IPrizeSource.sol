// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {externalEuint64} from "@fhevm/solidity/lib/FHE.sol";

/**
 * @title IPrizeSource
 * @notice The seam between where prize money comes from and how a draw spends it.
 *
 * @dev On Sepolia the implementation is `MockPrizeSource`, which is exactly what its name says: a
 *      funded reserve standing in for yield, not a yield strategy. Serein does not pretend otherwise
 *      and does not display an APY, because there is no measured yield to display.
 *
 *      The interface exists so a real confidential-yield adapter can replace the mock without
 *      touching principal accounting or the draw algorithm. Anything on the other side of this
 *      interface can only ever add funds to the prize reserve; the reserve holds no principal and
 *      the pool grants no spending authority over principal to anyone. That separation is what makes
 *      "no-loss" a structural property rather than an operational promise.
 */
interface IPrizeSource {
    event DrawFunded(uint256 indexed drawId, bytes32 amountHandle);

    /// @notice The confidential token prizes are denominated in.
    function confidentialToken() external view returns (address);

    /// @notice The reserve this source funds.
    function prizeReserve() external view returns (address);

    /**
     * @notice Allocate an encrypted amount to `drawId`.
     * @dev The amount is an encrypted input so individual draw allocations stay private, even though
     *      the total ever moved through the transparent ERC-20 boundary is public. See PRIVACY.md.
     */
    function fundDraw(uint256 drawId, externalEuint64 amount, bytes calldata inputProof) external;
}
