"use client";

import { ConnectButton as RainbowConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import { Button, cn } from "@/components/ui";
import { CHAIN, CHAIN_ID } from "@/lib/chain";

/**
 * Wallet connection.
 *
 * RainbowKit owns the modal, so someone with Rabby, Trust, Coinbase or a phone can use what they
 * already have. Serein owns the button, so the entry point still matches the rest of the product —
 * `ConnectButton.Custom` is the seam that allows both.
 *
 * The state this component most has to get right is the one between page load and a restored
 * session. wagmi reports `reconnecting` there, and rendering "Connect wallet" during it is what makes
 * a returning user think they were logged out.
 */

export interface WalletStatus {
  address: `0x${string}` | undefined;
  isConnected: boolean;
  /** True while wagmi is restoring a session. Not the same as disconnected. */
  isRestoring: boolean;
  /** Only true once wagmi has settled and there really is no wallet. */
  isDisconnected: boolean;
}

export function useWalletStatus(): WalletStatus {
  const { address, status } = useAccount();
  const isRestoring = status === "connecting" || status === "reconnecting";
  return {
    address,
    isConnected: status === "connected" && Boolean(address),
    isRestoring,
    isDisconnected: status === "disconnected",
  };
}

export function ConnectButton({ tone = "violet" }: { tone?: "violet" | "light" | "dark" }) {
  return (
    <RainbowConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        // RainbowKit reports `mounted: false` until it has settled on the client. Rendering the
        // connect prompt during that window is exactly the flash this component exists to avoid, so
        // it renders a placeholder of the same size instead — no layout shift, no wrong message.
        if (!mounted) {
          return (
            <div
              aria-hidden="true"
              data-testid="wallet-restoring"
              className="min-h-11 w-36 rounded-pill bg-white/[0.06]"
            />
          );
        }

        if (!account || !chain) {
          return (
            <Button tone={tone} onClick={openConnectModal}>
              Connect wallet
            </Button>
          );
        }

        if (chain.unsupported) {
          return (
            <Button tone={tone} onClick={openChainModal}>
              Wrong network
            </Button>
          );
        }

        return (
          <Button tone={tone} onClick={openAccountModal}>
            <span className="tabular">{account.displayName}</span>
          </Button>
        );
      }}
    </RainbowConnectButton.Custom>
  );
}

/**
 * The wrong-network state, handled as a first-class screen rather than a silent failure.
 *
 * Every write targets Sepolia. A wallet pointed elsewhere would produce a confusing revert at
 * signing time, so the action is blocked and the one-tap fix offered instead. Nothing is rendered
 * while the session is still being restored, because a half-restored wallet has no meaningful chain.
 */
export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, isRestoring } = useWalletStatus();
  const chainId = useChainId();
  const { switchChain, isPending, error } = useSwitchChain();

  if (isRestoring || !isConnected || chainId === CHAIN_ID) return <>{children}</>;

  return (
    <div className="rounded-card border border-violet/40 bg-violet/10 p-6">
      <h2 className="text-subheading">Switch to {CHAIN.name}</h2>
      <p className="mt-2 text-small text-white/70">
        Serein runs on {CHAIN.name}. Your wallet is on a different network, so transactions would
        fail. Switching does not move any funds.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => switchChain({ chainId: CHAIN_ID })} disabled={isPending}>
          {isPending ? "Check your wallet…" : `Switch to ${CHAIN.name}`}
        </Button>
        {error ? (
          <p role="alert" className="text-small text-white/70">
            {/^user rejected/i.test(error.message)
              ? "You declined the switch. You can change networks in your wallet instead."
              : "Your wallet would not switch automatically. Change networks in your wallet, then reload."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Persistent, unobtrusive reminder of what this is. */
export function TestnetNotice({ className }: { className?: string }) {
  return (
    <p className={cn("text-caption text-white/45", className)}>
      Sepolia testnet. Test tokens have no monetary value. Serein has not been independently
      audited.
    </p>
  );
}
