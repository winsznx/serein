import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";

import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";

// Secrets live outside the repo tree in a gitignored file. Nothing here reads a key from a
// committed location, and nothing prints one.
loadEnv({ path: resolve(__dirname, "../../.env") });
loadEnv({ path: resolve(__dirname, "../../.secrets/wallets.env") });

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL ?? "";

/**
 * Signer order is fixed and meaningful:
 *
 *   0 deployer — deploys, funds the prize source, and nothing else
 *   1 keeper   — progresses draws; holds no privilege the public does not also have
 *   2..4       — ephemeral participants used only for the live proof campaign
 *
 * Scripts index by position, so reordering this list changes who does what.
 */
const sepoliaAccounts = [
  process.env.DEPLOYER_PRIVATE_KEY,
  process.env.KEEPER_PRIVATE_KEY,
  process.env.PARTICIPANT_A_PRIVATE_KEY,
  process.env.PARTICIPANT_B_PRIVATE_KEY,
  process.env.PARTICIPANT_C_PRIVATE_KEY,
].filter((key): key is string => typeof key === "string" && key.length === 66 && key.startsWith("0x"));

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: {
      // The pool carries long natspec and several libraries; via-IR keeps the deployed size down
      // and avoids stack-too-deep in the selection walk.
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache_hardhat",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      // The FHEVM mock coprocessor runs on the in-process network. Mining on demand keeps
      // block.timestamp under test control, which the TWAB tests depend on.
      chainId: 31337,
      allowUnlimitedContractSize: true,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: sepoliaAccounts,
      // The default 20s is not enough for a shared endpoint under load; a headers timeout on the
      // first `eth_chainId` would otherwise abort a whole campaign before it sent a transaction.
      timeout: 120_000,
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY ?? "",
    },
  },
  // Sourcify needs no API key, so source verification is not gated on a credential the project
  // might not have. Etherscan verification runs too when a key is configured.
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify.dev/server",
    browserUrl: "https://repo.sourcify.dev",
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
  mocha: {
    timeout: 600_000,
  },
};

export default config;
