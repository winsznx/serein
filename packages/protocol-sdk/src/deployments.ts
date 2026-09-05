import manifest11155111 from "../../../deployments/11155111.json";

export interface DeploymentManifest {
  network: string;
  chainId: number;
  commit: string;
  deployedAt: string;
  deployer: string;
  drawDurationSeconds: string;
  /**
   * `"zama-canonical"` when the confidential asset is Zama's own registered wrapper, resolved
   * through the on-chain ConfidentialTokenWrappersRegistry rather than deployed by Serein. Absent on
   * older manifests, which deployed a Serein-owned token pair instead.
   */
  tokenSource?: string;
  contracts: Record<
    string,
    {
      address: string;
      deployedAtBlock: number;
      txHash: string;
      /**
       * The actual contract at this address, when it differs from the role-name key — e.g. the
       * `ConfidentialUSDC` slot holding Zama's `cUSDCMock` rather than a contract Serein deployed.
       */
      contractName?: string;
    }
  >;
}

/**
 * Deployment addresses, imported from the manifest the deploy script writes.
 *
 * Bundling the JSON rather than fetching it means the app cannot start against a stale or missing
 * address list — a wrong manifest is a build failure, not a runtime surprise on someone's first
 * transaction.
 */
const MANIFESTS: Record<number, DeploymentManifest> = {
  11155111: manifest11155111 as DeploymentManifest,
};

export function getDeployment(chainId: number): DeploymentManifest {
  const manifest = MANIFESTS[chainId];
  if (!manifest) {
    throw new Error(
      `Serein is not deployed on chain ${chainId}. Known chains: ${Object.keys(MANIFESTS).join(", ")}`,
    );
  }
  return manifest;
}

export function contractAddress(chainId: number, name: string): `0x${string}` {
  const entry = getDeployment(chainId).contracts[name];
  if (!entry) {
    throw new Error(`deployment for chain ${chainId} has no contract named "${name}"`);
  }
  return entry.address as `0x${string}`;
}
