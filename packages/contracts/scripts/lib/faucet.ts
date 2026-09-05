import type { Signer } from "ethers";
import { Contract } from "ethers";

import type { DeploymentManifest } from "./manifest";

/**
 * Get test tokens for a signer, on whichever underlying token this deployment actually uses.
 *
 * Serein's own `TestUSDC` exposes a named `claim()`, rate-limited per address, because an open
 * faucet on a token Serein controls needed a guard against one address inflating the pool's
 * aggregate weight. Zama's registered Sepolia USDC mock has no such thing — it's a plain, public
 * `mint(address,uint256)`, capped at 1,000,000 tokens per call, with no per-address state at all.
 * Same intent, different mechanics; calling `claim()` against Zama's mock fails outright, since the
 * function does not exist there.
 */
const MOCK_MINT_ABI = ["function mint(address account, uint256 amount) external"];

interface Receipt {
  hash: string;
  gasUsed: bigint;
}

export async function ensureUnderlyingBalance(
  manifest: DeploymentManifest,
  underlyingAddress: string,
  signer: Signer,
  recipient: string,
  minAmount: bigint,
  currentBalance: bigint,
): Promise<Receipt | null> {
  if (currentBalance >= minAmount) return null;

  if (manifest.tokenSource === "zama-canonical") {
    const mock = new Contract(underlyingAddress, MOCK_MINT_ABI, signer) as unknown as {
      mint(
        account: string,
        amount: bigint,
      ): Promise<{ hash: string; wait: () => Promise<{ gasUsed: bigint } | null> }>;
    };
    const tx = await mock.mint(recipient, minAmount);
    const receipt = await tx.wait();
    return { hash: tx.hash, gasUsed: receipt?.gasUsed ?? 0n };
  }

  const legacy = new Contract(
    underlyingAddress,
    ["function claim() external"],
    signer,
  ) as unknown as {
    claim(): Promise<{ hash: string; wait: () => Promise<{ gasUsed: bigint } | null> }>;
  };
  const tx = await legacy.claim();
  const receipt = await tx.wait();
  return { hash: tx.hash, gasUsed: receipt?.gasUsed ?? 0n };
}
