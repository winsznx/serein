/**
 * Generate the Sepolia-only wallets Serein deploys and tests with.
 *
 * Keys are written to `.secrets/wallets.env` with 0600 permissions and are never printed. Only the
 * public addresses go to stdout, because those are the only part anyone else needs — to fund them,
 * or to look them up on a block explorer.
 *
 * These are throwaway testnet keys. Never reuse a personal wallet here, and never treat the
 * deployer's activity as evidence that independent users exist.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { secp256k1 } from "ethereum-cryptography/secp256k1.js";
import { keccak256 } from "ethereum-cryptography/keccak.js";

const ROLES = ["DEPLOYER", "KEEPER", "PARTICIPANT_A", "PARTICIPANT_B", "PARTICIPANT_C"];
const secretsDir = resolve(process.cwd(), ".secrets");
const target = resolve(secretsDir, "wallets.env");

if (existsSync(target) && !process.argv.includes("--force")) {
  console.error(`${target} already exists. Refusing to overwrite existing keys.`);
  console.error("Pass --force only if you are certain the current wallets can be discarded.");
  process.exit(1);
}

function addressFor(privateKey) {
  const publicKey = secp256k1.getPublicKey(privateKey, false).slice(1);
  return `0x${Buffer.from(keccak256(publicKey).slice(-20)).toString("hex")}`;
}

function newWallet() {
  let privateKey;
  do {
    privateKey = randomBytes(32);
  } while (!secp256k1.utils.isValidPrivateKey(privateKey));

  return { privateKey: `0x${privateKey.toString("hex")}`, address: addressFor(privateKey) };
}

/**
 * Check the derivation against a known vector before generating anything.
 *
 * A broken or substituted crypto dependency would otherwise produce keys whose addresses do not
 * match — which you would discover only after funding the wrong address. This is the EIP-155
 * example key; its address is fixed and independently checkable with `cast wallet address`.
 */
function selfCheck() {
  const vector = Buffer.from(
    "4646464646464646464646464646464646464646464646464646464646464646",
    "hex",
  );
  const expected = "0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f";
  const actual = addressFor(vector);
  if (actual !== expected) {
    console.error(
      `Key derivation self-check failed: expected ${expected}, got ${actual}.\n` +
        `Refusing to generate wallets — the crypto dependency is not behaving as expected.`,
    );
    process.exit(1);
  }
}

selfCheck();

mkdirSync(secretsDir, { recursive: true, mode: 0o700 });

const secrets = [];
const addresses = [];
for (const role of ROLES) {
  const wallet = newWallet();
  secrets.push(`${role}_PRIVATE_KEY=${wallet.privateKey}`);
  addresses.push(`${role}_ADDRESS=${wallet.address}`);
}

writeFileSync(target, `${secrets.join("\n")}\n`, { mode: 0o600 });
writeFileSync(resolve(secretsDir, "addresses.txt"), `${addresses.join("\n")}\n`, { mode: 0o600 });

console.log("Generated 5 Sepolia-only wallets. Private keys are in .secrets/wallets.env (0600).\n");
console.log(addresses.join("\n"));
console.log("\nFund the deployer address before running `pnpm deploy:sepolia`.");
