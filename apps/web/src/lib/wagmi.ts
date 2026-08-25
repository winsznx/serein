"use client";

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  braveWallet,
  coinbaseWallet,
  injectedWallet,
  ledgerWallet,
  metaMaskWallet,
  okxWallet,
  phantomWallet,
  rabbyWallet,
  rainbowWallet,
  safeWallet,
  trustWallet,
  walletConnectWallet,
  zerionWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { sepolia } from "wagmi/chains";

import { RPC_PROXY_PATH } from "@/lib/chain";

/**
 * Wallet and transport configuration.
 *
 * Two things here are deliberate and were both bugs before.
 *
 * **State lives in a cookie, not `localStorage`.** With `localStorage` the server renders every page
 * as logged-out and the browser only reconnects after mount, so a refresh or a navigation flashes the
 * "Connect wallet" screen before snapping back. A returning user reads that as "I have to connect
 * again". A cookie is sent with the request, so `cookieToInitialState` can hand the server the real
 * connection state and the first paint is already correct.
 *
 * **Wallet choice comes from RainbowKit**, so someone with Rabby or Trust or a phone can use what
 * they already have instead of being told to install MetaMask.
 *
 * Reads go through the app's own `/api/rpc` route so the provider key stays a Worker secret and a
 * visitor who has not connected anything still sees live chain state. Writes never touch it — the
 * wallet signs and broadcasts those itself.
 */

const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

/**
 * WalletConnect is the only entry that genuinely needs a project id; everything else reaches the
 * wallet through an injected provider or its own SDK. Listing it without one would render a wallet
 * that fails the moment somebody picks it, so it appears only when it can actually work.
 */
const walletConnectAvailable = WALLETCONNECT_PROJECT_ID.length > 0;

const connectors = connectorsForWallets(
  [
    {
      // Wallets that reach the browser through an injected provider or their own SDK. These work
      // whether or not a WalletConnect project id is configured.
      groupName: "Popular",
      wallets: [
        injectedWallet,
        metaMaskWallet,
        rabbyWallet,
        rainbowWallet,
        coinbaseWallet,
        braveWallet,
      ],
    },
    {
      groupName: "More",
      wallets: walletConnectAvailable
        ? [
            walletConnectWallet,
            trustWallet,
            phantomWallet,
            okxWallet,
            zerionWallet,
            ledgerWallet,
            safeWallet,
          ]
        : [phantomWallet, okxWallet, zerionWallet, safeWallet],
    },
  ],
  {
    appName: "Serein",
    appDescription: "Private savings. Fair prizes.",
    appUrl: "https://serein.timjosh507.workers.dev",
    // RainbowKit requires the field. When it is empty, no WalletConnect-backed wallet is offered, so
    // nothing reads it.
    projectId: WALLETCONNECT_PROJECT_ID || "serein-local",
  },
);

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors,
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  transports: {
    [sepolia.id]: http(RPC_PROXY_PATH, {
      batch: true,
      retryCount: 2,
      retryDelay: 400,
    }),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
