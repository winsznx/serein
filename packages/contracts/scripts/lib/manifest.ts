import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface DeploymentManifest {
  network: string;
  chainId: number;
  commit: string;
  deployedAt: string;
  deployer: string;
  drawDurationSeconds: string;
  /** `"zama-canonical"` when the underlying/wrapper pair is Zama's own registered cUSDCMock. */
  tokenSource?: string;
  contracts: Record<
    string,
    { address: string; deployedAtBlock: number; txHash: string; contractName?: string }
  >;
}

/**
 * The single source of truth for deployed addresses.
 *
 * Everything — scripts, the web app, the docs page, the proof view — reads from here. Nothing keeps
 * its own copy, so a redeploy cannot leave a stale address behind somewhere nobody thought to look.
 */
export function loadManifest(chainId: number): DeploymentManifest {
  const path = resolve(__dirname, "../../../..", `deployments/${chainId}.json`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DeploymentManifest;
  } catch (error) {
    throw new Error(
      `no deployment manifest for chain ${chainId} at ${path}. ` +
        `Run \`pnpm deploy:sepolia\` first. (${String(error)})`,
    );
  }
}

export function addressOf(manifest: DeploymentManifest, name: string): string {
  const entry = manifest.contracts[name];
  if (!entry) {
    throw new Error(
      `manifest for chain ${manifest.chainId} has no entry for "${name}" ` +
        `(has: ${Object.keys(manifest.contracts).join(", ")})`,
    );
  }
  return entry.address;
}
