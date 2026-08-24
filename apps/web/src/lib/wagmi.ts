"use client";

import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

import { RPC_PROXY_PATH } from "@/lib/chain";

/**
 * Wallet and transport configuration.
 *
 * Reads go through the app's own `/api/rpc` route so the provider key stays a Worker secret and a
 * visitor who has not connected anything still sees live chain state. Writes never touch it — the
 * wallet signs and broadcasts those itself, so the app being down does not strand anyone's funds.
 *
 * WalletConnect is registered only when a project id is configured. Without one it would render a
 * connector that fails the moment someone picks it, which is worse than not offering it.
 */

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [
    injected({ shimDisconnect: true }),
    ...(walletConnectProjectId
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            showQrModal: true,
            metadata: {
              name: "Serein",
              description: "Private savings. Fair prizes.",
              url: "https://serein.app",
              icons: [],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [sepolia.id]: http(RPC_PROXY_PATH, {
      batch: true,
      retryCount: 2,
      retryDelay: 400,
    }),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
