"use client";

import { useState } from "react";
import { useSignTypedData, useWriteContract } from "wagmi";

import { PrivateValue, useRevealState } from "@/components/private-value";
import { TxStatus } from "@/components/tx-status";
import { Badge, Button, ButtonLink, Card } from "@/components/ui";
import { ConnectButton, TestnetNotice, useWalletStatus } from "@/components/wallet";
import { deployment, explorerTx } from "@/lib/chain";
import { revealValue } from "@/lib/fhe/reveal";
import { getFheInstance, toHex } from "@/lib/fhe/sdk";
import {
  formatTokenAmount,
  parseTokenAmount,
  PRIVATE_TOKEN_SYMBOL,
  TOKEN_SYMBOL,
} from "@/lib/format";
import { ABIS, useDeployment, usePoolSnapshot, useWalletSnapshot } from "@/lib/hooks/use-serein";
import { useTxFlow } from "@/lib/hooks/use-tx-flow";
import { usePendingUnwrap } from "@/lib/hooks/use-pending-unwrap";
import { DRAW_STATUS, DrawStatus } from "@serein/protocol-sdk";

/**
 * Taking savings back out — two distinct operations, not one magic button.
 *
 * `pool.withdraw()` moves encrypted principal back to the confidential wallet balance. That's it —
 * it never touches plain ERC-20, and it never waits on a draw. Getting the rest of the way to public
 * USDC is a separate act the wrapper itself owns: an async unwrap, request then finalize, proven live
 * in `packages/contracts/scripts/live-withdraw.ts` and ported here unchanged. Collapsing both into
 * one button would hide that a second, genuinely different transaction — one that makes an amount
 * public — happens along the way.
 */
type Tab = "from-serein" | "unwrap";

export default function WithdrawPage() {
  const { address, isConnected, isRestoring } = useWalletStatus();
  const state = useDeployment();
  const [tab, setTab] = useState<Tab>("from-serein");

  if (!state.ready) {
    return (
      <p className="py-12 text-center text-body text-white/60">
        Serein has no deployment on this chain yet.
      </p>
    );
  }

  if (isRestoring) {
    return (
      <p className="py-12 text-center text-body text-white/50" aria-live="polite">
        Restoring your session…
      </p>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-12 text-center">
        <h1 className="text-heading">Connect to withdraw</h1>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-heading">Withdraw</h1>
        <p className="text-body text-white/65">
          Move principal out of Serein, and optionally out of confidential form entirely.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Withdrawal type"
        className="inline-flex rounded-pill border border-white/12 bg-white/[0.04] p-1"
      >
        <TabButton active={tab === "from-serein"} onClick={() => setTab("from-serein")}>
          From Serein
        </TabButton>
        <TabButton active={tab === "unwrap"} onClick={() => setTab("unwrap")}>
          To public {TOKEN_SYMBOL}
        </TabButton>
      </div>

      {tab === "from-serein" ? (
        <FromSereinTab address={address} />
      ) : (
        <UnwrapTab address={address} />
      )}

      <TestnetNotice />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "min-h-10 rounded-pill px-4 text-small font-medium transition-colors " +
        (active ? "bg-violet text-white" : "text-white/60 hover:text-white")
      }
    >
      {children}
    </button>
  );
}

function FromSereinTab({ address }: { address: `0x${string}` }) {
  const wallet = useWalletSnapshot();
  const pool = usePoolSnapshot();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const flow = useTxFlow();
  const [revealState, reveal] = useRevealState();
  const [amount, setAmount] = useState("");

  const addresses = deployment().addresses!;
  const parsed = parseTokenAmount(amount);
  const invalid = amount !== "" && parsed === null;
  const revealedBalance = revealState.status === "revealed" ? revealState.value : null;
  const overBalance = revealedBalance !== null && parsed !== null && parsed > revealedBalance;

  return (
    <div className="space-y-6">
      <p className="text-small text-white/60">
        Move encrypted principal back to your confidential wallet balance. Your amount remains
        encrypted the whole way — this step never produces a public number.
      </p>

      <Card surface="deep" className="space-y-5 p-7">
        <h2 className="text-small text-white/55">Your private savings</h2>
        <PrivateValue
          size="heading"
          label="Your savings balance"
          state={revealState}
          disabled={!wallet.savingsHandle}
          revealLabel="Reveal balance"
          onReveal={() =>
            void reveal(() =>
              revealValue({
                user: address,
                handle: wallet.savingsHandle!,
                contractAddress: addresses.pool,
                alsoAuthorize: [addresses.prizeReserve, addresses.confidentialToken],
                signTypedData: (args) =>
                  signTypedDataAsync(args as Parameters<typeof signTypedDataAsync>[0]),
              }),
            )
          }
          render={(value) => (
            <>
              {formatTokenAmount(value)}{" "}
              <span className="text-body text-white/50">{PRIVATE_TOKEN_SYMBOL}</span>
            </>
          )}
        />

        {revealedBalance === null ? (
          <p className="text-caption text-white/45">
            You can withdraw without revealing. Revealing just lets this page check your amount
            before you sign.
          </p>
        ) : null}
      </Card>

      <Card className="space-y-4">
        <label className="block space-y-2">
          <span className="text-small text-white/70">Amount to withdraw</span>
          <div className="flex gap-2">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              aria-invalid={invalid || overBalance}
              className="min-h-12 w-full rounded-card border border-white/15 bg-abyss px-4 text-body text-white placeholder:text-white/30 focus:border-violet focus:outline-none"
            />
            {revealedBalance !== null ? (
              <Button
                tone="ghost-dark"
                onClick={() =>
                  setAmount(formatTokenAmount(revealedBalance, { maximumFractionDigits: 6 }))
                }
              >
                Max
              </Button>
            ) : null}
          </div>
          {revealedBalance === null ? (
            <p className="text-caption text-white/40">Reveal your balance above to use Max.</p>
          ) : null}
        </label>

        {invalid ? (
          <p role="alert" className="text-small text-white/80">
            Enter a number with at most six decimal places.
          </p>
        ) : null}

        {overBalance ? (
          <p role="alert" className="text-small text-white/80">
            That is more than your revealed balance. You can still send it — the contract clamps to
            your whole balance rather than reverting, so this can never fail as a way to probe the
            real number — but you probably meant a smaller amount.
          </p>
        ) : null}

        <Button
          disabled={flow.busy || parsed === null || parsed === 0n}
          onClick={() => {
            const prepared: { handle?: `0x${string}`; proof?: `0x${string}` } = {};
            void flow.run({
              prepare: async () => {
                const instance = await getFheInstance();
                const input = await instance
                  .createEncryptedInput(addresses.pool, address)
                  .add64(parsed!)
                  .encrypt();
                const handle = input.handles[0];
                if (!handle) throw new Error("The encryption step returned no ciphertext handle.");
                prepared.handle = toHex(handle);
                prepared.proof = toHex(input.inputProof);
              },
              send: () => {
                if (!prepared.handle || !prepared.proof) {
                  throw new Error("The encrypted input was not ready.");
                }
                return writeContractAsync({
                  address: addresses.pool,
                  abi: ABIS.pool,
                  functionName: "withdraw",
                  args: [prepared.handle, prepared.proof],
                });
              },
              onConfirmed: () => {
                setAmount("");
                wallet.refetch();
              },
            });
          }}
        >
          Withdraw from Serein
        </Button>

        <p className="text-caption text-white/45">
          The amount you enter is encrypted before it leaves this browser, so the withdrawal amount
          is not visible on chain either.
        </p>

        <TxStatus phase={flow.phase} />

        {flow.phase.status === "confirmed" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-white/12 bg-white/[0.04] p-4">
            <p className="text-small">
              Sent back to your confidential {PRIVATE_TOKEN_SYMBOL} balance. Still encrypted — use{" "}
              <span className="font-medium">To public {TOKEN_SYMBOL}</span> above to convert it.
            </p>
            <ButtonLink href="/app" tone="ghost-dark">
              Back to overview
            </ButtonLink>
          </div>
        ) : null}
      </Card>

      {pool.draw && pool.draw.status !== DrawStatus.Open ? (
        <Card className="border-violet/25 bg-violet/[0.06]">
          <h2 className="text-small font-medium">
            A draw is in progress — this does not block you
          </h2>
          <p className="mt-1.5 text-small text-white/70">
            Draw #{pool.currentDrawId.toString()} is{" "}
            {DRAW_STATUS[pool.draw.status].consumer.toLowerCase()}. A closed draw keeps the weight
            you already earned — withdrawing now doesn&apos;t rewrite it. Withdrawing during an{" "}
            <em>open</em> draw is different: it changes your time-weighted balance from this moment
            onward, in that still-accumulating draw.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function UnwrapTab({ address }: { address: `0x${string}` }) {
  const wallet = useWalletSnapshot();
  const addresses = deployment().addresses!;
  const { signTypedDataAsync } = useSignTypedData();
  const [revealState, reveal] = useRevealState();
  const [amount, setAmount] = useState("");
  const unwrap = usePendingUnwrap(addresses.confidentialToken);

  const revealedBalance = revealState.status === "revealed" ? revealState.value : null;
  const parsed = parseTokenAmount(amount);
  const invalid = amount !== "" && parsed === null;
  const busy = unwrap.step.phase !== "idle" && unwrap.step.phase !== "failed";

  return (
    <div className="space-y-6">
      <p className="text-small text-white/60">
        Convert your private {PRIVATE_TOKEN_SYMBOL} balance to public {TOKEN_SYMBOL}.
      </p>

      <Card surface="deep" className="space-y-3 border-violet/20 bg-violet/[0.05] p-5">
        <p className="text-small font-medium">Unwrapping crosses the public/private boundary</p>
        <p className="text-small text-white/70">
          The amount finalized into {TOKEN_SYMBOL} becomes public onchain, the same way wrapping did
          on the way in. Only what you choose to unwrap is exposed — the rest of your confidential
          balance stays encrypted.
        </p>
      </Card>

      {unwrap.step.phase === "idle" ? (
        <Card className="space-y-5">
          <div>
            <h2 className="text-small text-white/55">Your confidential wallet balance</h2>
            <PrivateValue
              size="heading"
              label="Your confidential wallet balance"
              state={revealState}
              disabled={!wallet.confidentialTokenHandle}
              revealLabel="Reveal balance"
              onReveal={() =>
                void reveal(() =>
                  revealValue({
                    user: address,
                    handle: wallet.confidentialTokenHandle!,
                    contractAddress: addresses.confidentialToken,
                    signTypedData: (args) =>
                      signTypedDataAsync(args as Parameters<typeof signTypedDataAsync>[0]),
                  }),
                )
              }
              render={(value) => (
                <>
                  {formatTokenAmount(value)}{" "}
                  <span className="text-body text-white/50">{PRIVATE_TOKEN_SYMBOL}</span>
                </>
              )}
            />
          </div>

          <label className="block space-y-2">
            <span className="text-small text-white/70">Amount to unwrap</span>
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                aria-invalid={invalid}
                className="min-h-12 w-full rounded-card border border-white/15 bg-abyss px-4 text-body text-white placeholder:text-white/30 focus:border-violet focus:outline-none"
              />
              {revealedBalance !== null ? (
                <Button
                  tone="ghost-dark"
                  onClick={() =>
                    setAmount(formatTokenAmount(revealedBalance, { maximumFractionDigits: 6 }))
                  }
                >
                  Max
                </Button>
              ) : null}
            </div>
            {revealedBalance === null ? (
              <p className="text-caption text-white/40">Reveal your balance above to use Max.</p>
            ) : null}
          </label>

          {invalid ? (
            <p role="alert" className="text-small text-white/80">
              Enter a number with at most six decimal places.
            </p>
          ) : null}

          {parsed !== null && parsed > 0n ? (
            <p className="text-small text-white/60">
              You receive{" "}
              <span className="font-medium text-white">
                {formatTokenAmount(parsed)} {TOKEN_SYMBOL}
              </span>
            </p>
          ) : null}

          <Button
            disabled={busy || parsed === null || parsed === 0n}
            onClick={() => void unwrap.start(parsed!)}
          >
            Unwrap to {TOKEN_SYMBOL}
          </Button>
        </Card>
      ) : null}

      {unwrap.step.phase !== "idle" ? (
        <UnwrapStepper unwrap={unwrap} onDone={() => setAmount("")} />
      ) : null}
    </div>
  );
}

function UnwrapStepper({
  unwrap,
  onDone,
}: {
  unwrap: ReturnType<typeof usePendingUnwrap>;
  onDone: () => void;
}) {
  const { step } = unwrap;

  const requestDone = step.phase !== "encrypting" && step.phase !== "requesting";
  const requestTxHash =
    step.phase === "waiting-kms" || step.phase === "finalizing" || step.phase === "done"
      ? step.requestTxHash
      : undefined;

  return (
    <Card className="space-y-5">
      <ol className="space-y-3">
        <StepRow
          index={1}
          label="Request unwrap"
          state={
            step.phase === "encrypting" || step.phase === "requesting"
              ? "current"
              : requestDone
                ? "done"
                : "pending"
          }
          detail={
            step.phase === "encrypting" ? (
              "Encrypting amount locally…"
            ) : step.phase === "requesting" ? (
              "Waiting for your wallet…"
            ) : requestTxHash ? (
              <TxLink hash={requestTxHash} />
            ) : undefined
          }
        />
        <StepRow
          index={2}
          label="Wait for Zama proof"
          state={
            step.phase === "waiting-kms"
              ? "current"
              : step.phase === "finalizing" || step.phase === "done"
                ? "done"
                : "pending"
          }
          detail={
            step.phase === "waiting-kms"
              ? "The relayer publicly decrypts the amount you unwrapped — this can take a few seconds."
              : undefined
          }
        />
        <StepRow
          index={3}
          label={`Finalize to ${TOKEN_SYMBOL}`}
          state={
            step.phase === "finalizing" ? "current" : step.phase === "done" ? "done" : "pending"
          }
          detail={step.phase === "done" ? <TxLink hash={step.finalizeTxHash} /> : undefined}
        />
      </ol>

      {step.phase === "waiting-kms" ? (
        <Button onClick={() => void unwrap.finalize()}>Finalize now</Button>
      ) : null}

      {step.phase === "done" ? (
        <div className="space-y-3 rounded-card border border-white/12 bg-white/[0.04] p-4">
          <p className="text-small font-medium">
            {formatTokenAmount(step.amount)} {TOKEN_SYMBOL} received
          </p>
          <p className="text-small text-white/65">This balance is now public on Sepolia.</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/app" tone="ghost-dark">
              Back to overview
            </ButtonLink>
          </div>
        </div>
      ) : null}

      {step.phase === "failed" ? (
        <div className="space-y-2 rounded-card border border-white/12 bg-white/[0.04] p-4">
          <p className="text-small font-medium">{step.message}</p>
          <p className="text-small text-white/65">{step.recovery}</p>
          <Button tone="ghost-dark" onClick={unwrap.dismiss}>
            Start over
          </Button>
        </div>
      ) : null}

      {step.phase !== "done" && step.phase !== "failed" ? (
        <p className="text-caption text-white/40">
          Safe to close this tab. The request lives onchain — reopening this page will offer to
          resume it.
        </p>
      ) : null}

      {step.phase === "done" ? (
        <Button tone="ghost-dark" onClick={() => (unwrap.dismiss(), onDone())}>
          Unwrap more
        </Button>
      ) : null}
    </Card>
  );
}

function StepRow({
  index,
  label,
  state,
  detail,
}: {
  index: number;
  label: string;
  state: "pending" | "current" | "done";
  detail?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-medium " +
          (state === "done"
            ? "bg-violet text-white"
            : state === "current"
              ? "border border-violet text-violet"
              : "border border-white/15 text-white/40")
        }
        aria-hidden="true"
      >
        {state === "done" ? "✓" : index}
      </span>
      <div className="min-w-0">
        <p
          className={
            "text-small font-medium " + (state === "pending" ? "text-white/40" : "text-white")
          }
        >
          {label}
        </p>
        {detail ? <p className="mt-0.5 text-caption text-white/50">{detail}</p> : null}
        {state === "current" && !detail ? <Badge tone="violet">waiting…</Badge> : null}
      </div>
    </li>
  );
}

function TxLink({ hash }: { hash: `0x${string}` }) {
  return (
    <a
      href={explorerTx(hash)}
      target="_blank"
      rel="noreferrer noopener"
      className="text-caption text-violet underline underline-offset-4"
    >
      confirmed ✓ view transaction ↗
    </a>
  );
}
