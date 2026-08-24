"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { Button, cn } from "@/components/ui";
import { CHAIN, CHAIN_ID } from "@/lib/chain";
import { truncateAddress } from "@/lib/format";

/**
 * Wallet connection, built rather than dropped in.
 *
 * An off-the-shelf modal would arrive with its own type scale, its own radii, and its own accent
 * colour, and would be the one part of the product that looks like it came from somewhere else.
 * Building it is also what makes the failure states legible: "no wallet installed", "you declined",
 * and "wrong network" are three different situations with three different next actions, and a
 * generic modal collapses them into one spinner.
 */

export function ConnectButton({ tone = "violet" }: { tone?: "violet" | "light" | "dark" }) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        // Focus goes back where it came from, so keyboard users are not dropped at the top.
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (isConnected && address) {
    return (
      <div className="relative">
        <Button
          ref={triggerRef}
          tone={tone}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <span className="tabular">{truncateAddress(address)}</span>
        </Button>
        {open ? (
          <div
            ref={menuRef}
            role="menu"
            className="absolute right-0 z-50 mt-2 w-56 rounded-card border border-white/12 bg-abyss p-2 shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
          >
            <p className="truncate-hex px-3 py-2 text-caption text-white/55">{address}</p>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(address);
                setOpen(false);
              }}
              className="w-full rounded-badge px-3 py-2 text-left text-small text-white/85 hover:bg-white/10"
            >
              Copy address
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="w-full rounded-badge px-3 py-2 text-left text-small text-white/85 hover:bg-white/10"
            >
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const injectedConnector = connectors.find((connector) => connector.id === "injected");
  const others = connectors.filter((connector) => connector.id !== "injected");

  // A browser with no injected provider and no WalletConnect has nothing to connect to. Saying so
  // beats a button that opens a menu with nothing in it.
  const hasNothing =
    others.length === 0 && typeof window !== "undefined" && !("ethereum" in window);

  if (hasNothing) {
    return (
      <a
        href="https://ethereum.org/en/wallets/find-wallet/"
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex min-h-11 items-center justify-center rounded-pill border border-white/25 px-5 text-small font-medium text-white hover:bg-white/10"
      >
        Get a wallet
      </a>
    );
  }

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        tone={tone}
        onClick={() => {
          if (others.length === 0 && injectedConnector) {
            connect({ connector: injectedConnector });
            return;
          }
          setOpen((value) => !value);
        }}
        disabled={isPending}
        aria-expanded={others.length > 0 ? open : undefined}
        aria-haspopup={others.length > 0 ? "menu" : undefined}
      >
        {isPending ? "Check your wallet…" : "Connect wallet"}
      </Button>

      {open && others.length > 0 ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 rounded-card border border-white/12 bg-abyss p-2 shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
        >
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              role="menuitem"
              type="button"
              onClick={() => {
                connect({ connector });
                setOpen(false);
              }}
              className="w-full rounded-badge px-3 py-2 text-left text-small text-white/85 hover:bg-white/10"
            >
              {connector.name}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="absolute right-0 mt-2 w-64 text-caption text-white/70">
          {/^user rejected/i.test(error.message)
            ? "You declined the connection. Nothing was shared."
            : error.message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The wrong-network state, handled as a first-class screen rather than a silent failure.
 *
 * Every write in this app targets Sepolia. A wallet pointed elsewhere would produce a confusing
 * revert at signing time, so the app blocks the action and offers the one-tap fix instead.
 */
export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending, error } = useSwitchChain();

  if (!isConnected || chainId === CHAIN_ID) return <>{children}</>;

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
      Sepolia testnet. Test tokens have no monetary value. Serein has not been independently audited.
    </p>
  );
}
