"use client";

import Link from "next/link";
import { useAccount, useSignTypedData } from "wagmi";

import { DrawCountdown, DrawProgress, DrawStatusPill } from "@/components/draw-progress";
import { PrivateValue, useRevealState } from "@/components/private-value";
import { Badge, ButtonLink, Card, DataRow, StatusPill } from "@/components/ui";
import { ConnectButton, TestnetNotice } from "@/components/wallet";
import { deployment } from "@/lib/chain";
import { revealValue } from "@/lib/fhe/reveal";
import { formatTokenAmount, PRIVATE_TOKEN_SYMBOL, TOKEN_SYMBOL } from "@/lib/format";
import {
  anonymitySetWarning,
  useDeployment,
  useDrawResult,
  usePoolSnapshot,
  useWalletSnapshot,
} from "@/lib/hooks/use-serein";
import { DRAW_STATUS, DrawStatus } from "@serein/protocol-sdk";

/**
 * The savings home.
 *
 * The dominant element is the balance, and its default state is encrypted — that is the product in
 * one glance. Everything else is secondary: the draw, the actions, the link to the proof view. The
 * PRD is explicit that this must not become a twelve-card DeFi dashboard, and the surest way to
 * avoid that is to give the screen one subject.
 */
export default function AppHome() {
  const { isConnected, address } = useAccount();
  const state = useDeployment();
  const pool = usePoolSnapshot();
  const wallet = useWalletSnapshot();
  const { signTypedDataAsync } = useSignTypedData();
  const [revealState, reveal] = useRevealState();

  if (!state.ready) return <NotDeployed />;
  if (!isConnected || !address) return <Disconnected />;

  const draw = pool.draw;
  const onboarding = nextStep(wallet);
  const warning = anonymitySetWarning(pool.participantCount);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone="violet">◆ Encrypted savings</Badge>
        <Badge tone="neutral">Sepolia testnet</Badge>
      </div>

      {onboarding ? <OnboardingBanner step={onboarding} /> : null}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        {/* The subject of the screen. */}
        <Card surface="deep" className="p-7 md:p-8">
          <h1 className="text-small text-white/55">Your private savings</h1>
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
              Take out savings
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
                <DataRow label="Your draw weight">
                  <StatusPill state="encrypted">Private</StatusPill>
                </DataRow>
                <DataRow label="Prize">
                  <StatusPill state="encrypted">Private</StatusPill>
                </DataRow>
              </dl>

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

      <div className="grid gap-4 sm:grid-cols-3">
        <MiniStat
          label={`Public ${TOKEN_SYMBOL}`}
          value={formatTokenAmount(wallet.underlyingBalance)}
          hint="Visible on chain. This is the transparent side of the boundary."
        />
        <MiniStat
          label={`Private ${PRIVATE_TOKEN_SYMBOL}`}
          value="••••••"
          hint="Held but not yet saved. Encrypted."
          masked
        />
        <MiniStat
          label="Registered"
          value={wallet.isRegistered ? "Yes" : "Not yet"}
          hint="Participation is public; amounts are not."
        />
      </div>

      <TestnetNotice />
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  masked,
}: {
  label: string;
  value: string;
  hint: string;
  masked?: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="text-caption text-white/50">{label}</p>
      <p
        className={masked ? "mt-1.5 ciphertext text-subheading" : "mt-1.5 tabular text-subheading"}
      >
        {value}
      </p>
      <p className="mt-1 text-caption text-white/45">{hint}</p>
    </Card>
  );
}

function LatestResult({ currentDrawId }: { currentDrawId: bigint }) {
  const previousId = currentDrawId > 1n ? currentDrawId - 1n : undefined;
  const result = useDrawResult(previousId);

  if (!previousId || !result.isCredited) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-subheading">Draw #{previousId.toString()} result</h2>
          <p className="mt-1 text-small text-white/60">
            Your result is encrypted. Reveal it privately, or collect it either way — the
            transaction looks identical whether or not you won.
          </p>
        </div>
        <ButtonLink href={`/app/draws/${previousId}`} tone="outline-violet">
          {result.hasClaimed ? "View result" : "Reveal and collect"}
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
      title: "Get test USDC to begin",
      body: "The faucet sends 1,000 test tokens to your address. They have no monetary value.",
      href: "/app/save",
      cta: "Get test USDC",
    };
  }

  if (!wallet.confidentialTokenHandle && !wallet.savingsHandle) {
    return {
      title: "Make your test USDC private",
      body: "Wrapping converts the public token into its confidential form. This step is visible on chain — everything after it is not.",
      href: "/app/save",
      cta: "Make it private",
    };
  }

  if (!wallet.savingsHandle) {
    return {
      title: "Add your first savings",
      body: "Your amount is encrypted in your browser before it is sent. The pool never sees it.",
      href: "/app/save",
      cta: "Add savings",
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
