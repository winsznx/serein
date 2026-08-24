import { sepolia } from "viem/chains";

import { getDeployment } from "@serein/protocol-sdk";

export const CHAIN = sepolia;
export const CHAIN_ID = sepolia.id;

/**
 * The JSON-RPC endpoint the browser reads through.
 *
 * Reads go to the app's own `/api/rpc` route rather than straight to a provider, for two reasons:
 * the Alchemy key stays a Worker secret instead of being shipped to every visitor, and a reader who
 * has not connected a wallet yet still gets live chain data. Writes never go through it — those are
 * signed and broadcast by the user's own wallet.
 *
 * This is a convenience layer, not a trust dependency. Everything the app displays is verifiable on
 * a block explorer, and if the proxy is down the wallet can still transact.
 */
export const RPC_PROXY_PATH = "/api/rpc";

export function rpcUrl(): string {
  if (typeof window === "undefined") return RPC_PROXY_PATH;
  return new URL(RPC_PROXY_PATH, window.location.origin).toString();
}

export interface SereinAddresses {
  pool: `0x${string}`;
  prizeReserve: `0x${string}`;
  prizeSource: `0x${string}`;
  underlyingToken: `0x${string}`;
  confidentialToken: `0x${string}`;
}

export interface DeploymentState {
  ready: boolean;
  commit: string;
  deployedAt: string;
  drawDurationSeconds: number;
  addresses: SereinAddresses | null;
}

const REQUIRED = {
  pool: "SereinPool",
  prizeReserve: "SereinPrizeReserve",
  prizeSource: "MockPrizeSource",
  underlyingToken: "TestUSDC",
  confidentialToken: "ConfidentialUSDC",
} as const;

/**
 * Read the deployment manifest.
 *
 * Returns `ready: false` rather than throwing when the manifest has no addresses yet, so a build can
 * succeed before the contracts are deployed and the app can say so plainly instead of crashing on a
 * blank page. Every screen that needs an address checks this first.
 */
export function deployment(): DeploymentState {
  const manifest = getDeployment(CHAIN_ID);
  const entries = Object.entries(REQUIRED).map(([key, name]) => {
    const contract = manifest.contracts[name];
    return [key, contract?.address] as const;
  });

  const missing = entries.filter(([, address]) => !address);
  if (missing.length > 0) {
    return {
      ready: false,
      commit: manifest.commit,
      deployedAt: manifest.deployedAt,
      drawDurationSeconds: Number(manifest.drawDurationSeconds),
      addresses: null,
    };
  }

  return {
    ready: true,
    commit: manifest.commit,
    deployedAt: manifest.deployedAt,
    drawDurationSeconds: Number(manifest.drawDurationSeconds),
    addresses: Object.fromEntries(entries) as unknown as SereinAddresses,
  };
}

/** Throws when called on a screen that should have checked `deployment().ready` first. */
export function addresses(): SereinAddresses {
  const state = deployment();
  if (!state.addresses) {
    throw new Error(
      "Serein is not deployed on this chain yet. Screens that need an address must check " +
        "`deployment().ready` before rendering.",
    );
  }
  return state.addresses;
}

export function explorerTx(hash: string): string {
  return `${CHAIN.blockExplorers.default.url}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${CHAIN.blockExplorers.default.url}/address/${address}`;
}
