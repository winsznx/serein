"use client";

import Link from "next/link";
import { useState } from "react";
import { useSignTypedData } from "wagmi";

import { TokenIdentity } from "@/components/app/TokenIdentity";
import { DrawCountdown, DrawProgress, DrawStatusPill } from "@/components/draw-progress";
import { PrivateValue, useRevealState } from "@/components/private-value";
import { Badge, ButtonLink, Card, DataRow, StatusPill } from "@/components/ui";
import { ConnectButton, TestnetNotice, useWalletStatus } from "@/components/wallet";
import { deployment, explorerAddress } from "@/lib/chain";
import { revealValue } from "@/lib/fhe/reveal";
import {
  formatTokenAmount,
  PRIVATE_TOKEN_SYMBOL,
  TOKEN_SYMBOL,
  truncateAddress,
} from "@/lib/format";
import { useRecentActivity } from "@/lib/hooks/use-recent-activity";
import { useRegistryStatus } from "@/lib/hooks/use-registry-status";
import {
  anonymitySetWarning,
  useDeployment,
  useDrawResult,
  usePoolSnapshot,
  useWalletSnapshot,
} from "@/lib/hooks/use-serein";
import { confidentialTokenMetadata, publicTokenMetadata } from "@/lib/token-metadata";
import { DRAW_STATUS, DrawStatus } from "@serein/protocol-sdk";

/**
 * The savings home.
 *
 * The dominant element is the balance, and its default state is encrypted — that is the product in
 * one glance. Everything else is secondary: the draw, the asset states, the link to the proof view.
 * This must not become a twelve-card DeFi dashboard, and the surest way to avoid that is to give the
 * screen one subject and let everything else sit visibly beneath it.
 */
export default function AppHome() {
  const { address, isConnected, isRestoring } = useWalletStatus();
  const state = useDeployment();
  const pool = usePoolSnapshot();
  const wallet = useWalletSnapshot();
  const { signTypedDataAsync } = useSignTypedData();
  const [revealState, reveal] = useRevealState();

  if (!state.ready) return <NotDeployed />;
  // Restoring is not the same as disconnected. Showing the connect prompt here is what made a
  // refresh look like a logout.
  if (isRestoring) return <RestoringSession />;
  if (!isConnected || !address) return <Disconnected />;

  const draw = pool.draw;
  const onboarding = nextStep(wallet);
  const warning = anonymitySetWarning(pool.participantCount);
  const isZamaCanonical = state.isZamaCanonical;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-heading">Your Serein position</h1>
          <Badge tone="neutral">
            <span className="text-white/60" aria-hidden="true">
              ●
            </span>{" "}
            {pool.isLoading ? "Syncing…" : "Live"} · Sepolia
          </Badge>
        </div>
        <p className="text-small text-white/55">
          Private savings on Sepolia{" "}
          {isZamaCanonical
            ? "using Zama's registered cUSDCMock."
            : "using Serein's testnet fixture."}
        </p>
      </header>

      {onboarding ? <OnboardingBanner step={onboarding} /> : null}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        {/* The subject of the screen. */}
        <Card surface="deep" className="p-7 md:p-8">
          <h2 className="text-small text-white/55">Your private savings</h2>
          <div className="mt-4">
            <PrivateValue
              label="Your savings balance"
              state={revealState}
              disabled={!wallet.savingsHandle}
              onReveal={() =>
                void reveal(async () => {
                  const addresses = deployment().addresses!;
                  return revealValue({
                    user: address,
                    handle: wallet.savingsHandle!,
                    contractAddress: addresses.pool,
                    alsoAuthorize: [addresses.prizeReserve, addresses.confidentialToken],
                    signTypedData: (args) =>
                      signTypedDataAsync(args as Parameters<typeof signTypedDataAsync>[0]),
                  });
                })
              }
              render={(value) => (
                <>
                  {formatTokenAmount(value)}{" "}
                  <span className="text-subheading text-white/50">{PRIVATE_TOKEN_SYMBOL}</span>
                </>
              )}
            />
          </div>

          {!wallet.savingsHandle ? (
            <p className="mt-4 text-small text-white/55">
              You have not saved anything yet. Once you do, your balance lives here as a ciphertext
              only you can read.
            </p>
          ) : null}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/app/save" tone="violet" fullWidth>
              Add savings
            </ButtonLink>
            <ButtonLink href="/app/withdraw" tone="ghost-dark" fullWidth>
              Withdraw
            </ButtonLink>
          </div>
        </Card>

        {/* Secondary: the draw. */}
        <Card className="p-7">
          {draw ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-subheading">Draw #{pool.currentDrawId.toString()}</h2>
                <DrawStatusPill status={draw.status} />
              </div>

              <dl className="mt-5">
                <DataRow label={draw.status === DrawStatus.Open ? "Ends in" : "Ended"}>
                  <span className="tabular">
                    {draw.status === DrawStatus.Open ? (
                      <DrawCountdown endTimestamp={draw.endTimestamp} />
                    ) : (
                      "Closed"
                    )}
                  </span>
                </DataRow>
                <DataRow label="Savers in this draw">
                  <span className="tabular">{pool.participantCount}</span>
                </DataRow>
                <DataRow label="Your participation">
                  {wallet.isRegistered ? (
                    <StatusPill state="public">Entered</StatusPill>
                  ) : (
                    <StatusPill state="pending">Not entered yet</StatusPill>
                  )}
                </DataRow>
                <DataRow label="Your draw weight">
                  <StatusPill state="encrypted">Private</StatusPill>
                </DataRow>
                <DataRow label="Prize">
                  <StatusPill state="encrypted">Private</StatusPill>
                </DataRow>
              </dl>

              {!wallet.isRegistered ? (
                <p className="mt-3 text-caption text-white/45">
                  Your first deposit registers you for the current draw automatically.
                </p>
              ) : null}

              <div className="mt-6">
                <DrawProgress draw={draw} compact />
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href={`/app/draws/${pool.currentDrawId}`} tone="ghost-dark">
                  Draw detail
                </ButtonLink>
                <ButtonLink href={`/proof/draws/${pool.currentDrawId}`} tone="ghost-dark">
                  Proof view
                </ButtonLink>
              </div>
            </>
          ) : (
            <p className="text-small text-white/60">Loading the current draw…</p>
          )}
        </Card>
      </div>

      {warning ? (
        <Card className="border-violet/30 bg-violet/[0.07]">
          <h2 className="text-small font-medium">A note on this pool&apos;s size</h2>
          <p className="mt-1.5 text-small text-white/70">{warning}</p>
        </Card>
      ) : null}

      <LatestResult currentDrawId={pool.currentDrawId} />

      <AssetStateRail wallet={wallet} />

      <RecentActivityPreview address={address} />

      <ProtocolDetails />

      <TestnetNotice />
    </div>
  );
}

function AssetStateRail({ wallet }: { wallet: ReturnType<typeof useWalletSnapshot> }) {
  const publicToken = publicTokenMetadata();
  const confidentialToken = confidentialTokenMetadata();
  const registryStatus = useRegistryStatus();

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card className="space-y-3 p-5">
        <TokenIdentity token={publicToken} size="sm" showAddress={false} />
        <p className="tabular text-subheading">{formatTokenAmount(wallet.underlyingBalance)}</p>
        <p className="text-caption text-white/45">Visible onchain</p>
        <ButtonLink href="/app/save" tone="ghost-dark" size="md" fullWidth>
          Make private
        </ButtonLink>
      </Card>

      <Card className="space-y-3 p-5">
        <TokenIdentity
          token={confidentialToken}
          registryStatus={registryStatus}
          size="sm"
          showAddress={false}
        />
        <p className="ciphertext text-subheading">••••••</p>
        <p className="text-caption text-white/45">Encrypted</p>
        <ButtonLink href="/app/save" tone="ghost-dark" size="md" fullWidth>
          Add to Serein
        </ButtonLink>
      </Card>

      <Card className="space-y-3 p-5">
        <p className="text-small font-medium text-white">Saved in Serein</p>
        <p className="ciphertext text-subheading">{wallet.savingsHandle ? "••••••" : "0.00"}</p>
        <p className="text-caption text-white/45">
          {wallet.savingsHandle ? "Encrypted" : "Nothing saved yet"}
        </p>
        <ButtonLink href="/app/withdraw" tone="ghost-dark" size="md" fullWidth>
          Withdraw
        </ButtonLink>
      </Card>
    </div>
  );
}

function RecentActivityPreview({ address }: { address: `0x${string}` }) {
  const { rows, isLoading, isError } = useRecentActivity(address, 5);

  if (isLoading) {
    return (
      <Card className="space-y-3">
        <h2 className="text-small font-medium text-white/70">Recent activity</h2>
        <div className="space-y-2">
          <div className="h-10 animate-pulse rounded-card bg-white/[0.04]" />
          <div className="h-10 animate-pulse rounded-card bg-white/[0.04]" />
        </div>
      </Card>
    );
  }

  // A fetch failure is never rendered as "no activity" — those are different facts, and collapsing
  // them is exactly the bug class that once made the proof view's transcript look permanently empty.
  if (isError) {
    return (
      <Card className="border-white/15">
        <h2 className="text-small font-medium text-white/70">Recent activity</h2>
        <p className="mt-2 text-small text-white/60">
          Could not read your activity from the RPC provider right now. Your funds are unaffected —
          this is a read-only view.
        </p>
      </Card>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Card>
        <h2 className="text-small font-medium text-white/70">Recent activity</h2>
        <p className="mt-2 text-small text-white/60">
          No Serein activity for this wallet yet. Start by minting test {TOKEN_SYMBOL}.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-1">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-small font-medium text-white/70">Recent activity</h2>
        <Link
          href="/app/activity"
          className="text-caption text-violet underline underline-offset-4"
        >
          View all
        </Link>
      </div>
      {rows.map((row) => (
        <div
          key={row.txHash}
          className="flex items-center justify-between border-t border-white/10 py-3 first:border-t-0"
        >
          <p className="text-small">{row.label}</p>
          <a
            href={`https://sepolia.etherscan.io/tx/${row.txHash}`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-caption text-white/40 underline decoration-white/20 underline-offset-2 hover:text-white/70"
          >
            block {row.blockNumber.toString()} ↗
          </a>
        </div>
      ))}
    </Card>
  );
}

function ProtocolDetails() {
  const [open, setOpen] = useState(false);
  const state = useDeployment();
  const addresses = state.addresses;
  if (!addresses) return null;

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between px-6 py-4 text-left"
      >
        <span className="text-small font-medium text-white/70">Protocol details</span>
        <span className="text-white/40" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <dl className="border-t border-white/10 px-6 pb-2">
          <DataRow label="Pool">
            <ExplorerLink address={addresses.pool} />
          </DataRow>
          <DataRow label="Prize reserve">
            <ExplorerLink address={addresses.prizeReserve} />
          </DataRow>
          <DataRow label="Prize source">
            <ExplorerLink address={addresses.prizeSource} />
          </DataRow>
          <DataRow label="Public token">
            <ExplorerLink address={addresses.underlyingToken} />
          </DataRow>
          <DataRow label="Private token">
            <ExplorerLink address={addresses.confidentialToken} />
          </DataRow>
          <DataRow label="Deployment commit">
            <span className="font-mono text-caption">{state.commit.slice(0, 12)}</span>
          </DataRow>
          <DataRow label="Full contract list">
            <Link href="/docs/contracts" className="text-violet underline underline-offset-4">
              docs/contracts
            </Link>
          </DataRow>
          <DataRow label="Proof">
            <Link href="/proof" className="text-violet underline underline-offset-4">
              /proof
            </Link>
          </DataRow>
        </dl>
      ) : null}
    </Card>
  );
}

function ExplorerLink({ address }: { address: `0x${string}` }) {
  return (
    <a
      href={explorerAddress(address)}
      target="_blank"
      rel="noreferrer noopener"
      className="font-mono text-caption text-violet underline underline-offset-4"
    >
      {truncateAddress(address)} ↗
    </a>
  );
}

function LatestResult({ currentDrawId }: { currentDrawId: bigint }) {
  const previousId = currentDrawId > 1n ? currentDrawId - 1n : undefined;
  const result = useDrawResult(previousId);

  if (!previousId || !result.isCredited) return null;

  return (
    <Card className="border-violet/25 bg-violet/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-subheading">Draw #{previousId.toString()} result is ready</h2>
          <p className="mt-1 text-small text-white/60">
            Your result is encrypted. Reveal it privately, or collect it either way — the
            transaction looks identical whether or not you won.
          </p>
        </div>
        <ButtonLink href={`/app/draws/${previousId}`} tone="outline-violet">
          {result.hasClaimed ? "Result settled — view" : "Reveal result"}
        </ButtonLink>
      </div>
    </Card>
  );
}

type OnboardingStep = {
  title: string;
  body: string;
  href: string;
  cta: string;
};

/**
 * Route the visitor to whatever they have not done yet.
 *
 * A judge should never have to work out which step comes next, so the app detects the state and
 * points at exactly one action rather than presenting a checklist and hoping.
 */
function nextStep(wallet: ReturnType<typeof useWalletSnapshot>): OnboardingStep | null {
  if (wallet.isLoading) return null;

  if (wallet.underlyingBalance === 0n && !wallet.confidentialTokenHandle && !wallet.savingsHandle) {
    return {
      title: `Mint ${TOKEN_SYMBOL} to begin`,
      body: `A public mint sends test tokens to your address. They have no monetary value.`,
      href: "/app/save",
      cta: `Mint ${TOKEN_SYMBOL}`,
    };
  }

  if (!wallet.confidentialTokenHandle && !wallet.savingsHandle) {
    return {
      title: `Wrap your ${TOKEN_SYMBOL} to ${PRIVATE_TOKEN_SYMBOL}`,
      body: "Wrapping converts the public token into its confidential form. This step is visible on chain — everything after it is not.",
      href: "/app/save",
      cta: "Make it private",
    };
  }

  if (!wallet.savingsHandle) {
    return {
      title: "Deposit to Serein",
      body: "Your amount is encrypted in your browser before it is sent. The pool never sees it.",
      href: "/app/save",
      cta: "Deposit to Serein",
    };
  }

  return null;
}

function OnboardingBanner({ step }: { step: OnboardingStep }) {
  return (
    <Card className="border-violet/35 bg-violet/[0.08]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="text-subheading">{step.title}</h2>
          <p className="mt-1.5 text-small text-white/70">{step.body}</p>
        </div>
        <ButtonLink href={step.href} tone="violet">
          {step.cta}
        </ButtonLink>
      </div>
    </Card>
  );
}

function RestoringSession() {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-12 text-center" aria-live="polite">
      <div className="mx-auto h-8 w-48 animate-pulse rounded-pill bg-white/[0.06]" />
      <p className="text-small text-white/50">Restoring your session…</p>
    </div>
  );
}

function Disconnected() {
  return (
    <div className="mx-auto max-w-xl space-y-6 py-12 text-center">
      <h1 className="text-heading">Connect a wallet to start saving</h1>
      <p className="text-body text-white/65">
        Serein runs on Sepolia with test tokens. Connecting is read-only until you approve a
        transaction, and revealing your own balance only ever asks for a signature — never a
        transfer.
      </p>
      <div className="flex justify-center">
        <ConnectButton />
      </div>
      <p className="text-small text-white/50">
        New to this?{" "}
        <Link href="/docs/how-it-works" className="underline underline-offset-4">
          Read how it works
        </Link>{" "}
        first.
      </p>
    </div>
  );
}

function NotDeployed() {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-12 text-center">
      <h1 className="text-heading">Not deployed yet</h1>
      <p className="text-body text-white/65">
        This build has no contract addresses for Sepolia. The deployment manifest at
        <code className="mx-1 rounded-badge bg-white/10 px-1.5 py-0.5 font-mono text-caption">
          deployments/11155111.json
        </code>
        is empty, which means the contracts have not been deployed from this commit.
      </p>
      <p className="text-small text-white/50">{DRAW_STATUS[DrawStatus.None].explanation}</p>
    </div>
  );
}
