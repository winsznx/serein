// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";

/**
 * @title ConfidentialUSDC
 * @notice The ERC-7984 confidential form of `TestUSDC`, and the asset Serein actually saves.
 *
 * @dev A thin concrete instantiation of OpenZeppelin's audited wrapper — Serein deliberately adds no
 *      behaviour of its own to the token layer. The pool is written against `IERC7984`, not against
 *      this contract, so a deployment can point at any conforming confidential token.
 *
 *      Two properties of the wrapper matter to how Serein presents itself to a saver:
 *
 *      Wrapping is transparent. `wrap` moves a plain ERC-20 amount, and that amount is visible to
 *      anyone reading the chain. Everything after it — the savings balance, the draw weight, the
 *      odds, the winner, the prize — is not. The app says this in the Make private step rather than
 *      letting someone assume the boundary is further left than it is.
 *
 *      Unwrapping is asynchronous. `unwrap` opens a request that only completes once the KMS has
 *      signed the cleartext amount and someone calls `finalizeUnwrap`. That is a two-step flow, so
 *      the UI treats it as one instead of pretending a single transaction finished the job.
 */
contract ConfidentialUSDC is ERC7984ERC20Wrapper, ZamaEthereumConfig {
    constructor(
        IERC20 underlying_,
        string memory contractURI_
    )
        ERC7984("Serein Private Test USDC", "ptUSDC", contractURI_)
        ERC7984ERC20Wrapper(underlying_)
    {}
}
