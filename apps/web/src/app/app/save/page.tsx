"use client";

import { useState } from "react";
import { parseAbi } from "viem";
import { useSignTypedData, useWriteContract } from "wagmi";

import { PrivateValue, useRevealState } from "@/components/private-value";
import { TxStatus } from "@/components/tx-status";
import { Badge, Button, ButtonLink, Card, StatusPill } from "@/components/ui";
import { TokenIdentity } from "@/components/app/TokenIdentity";
import { ConnectButton, TestnetNotice, useWalletStatus } from "@/components/wallet";
import { deployment } from "@/lib/chain";
import { revealValue } from "@/lib/fhe/reveal";
import { getFheInstance, toHex } from "@/lib/fhe/sdk";
import {
  formatCountdown,
  formatTokenAmount,
  parseTokenAmount,
  PRIVATE_TOKEN_SYMBOL,
  TOKEN_DECIMALS,
  TOKEN_SYMBOL,
} from "@/lib/format";
import { confidentialTokenMetadata, publicTokenMetadata } from "@/lib/token-metadata";
import { useRegistryStatus } from "@/lib/hooks/use-registry-status";
import { ABIS, useDeployment, usePoolSnapshot, useWalletSnapshot } from "@/lib/hooks/use-serein";
import { useTxFlow } from "@/lib/hooks/use-tx-flow";

/**
 * Getting money in: mint, wrap, deposit — as a progressive stepper, not three permanently expanded
 * cards. A returning saver who already holds cUSDCMock should see two collapsed lines of receipts
 * and one open step, not the onboarding they finished last week.
 */
export default function SavePage() {
  const { address, isConnected, isRestoring } = useWalletStatus();
  const state = useDeployment();
  const wallet = useWalletSnapshot();

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
        <h1 className="text-heading">Connect to add savings</h1>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  const hasPublic = wallet.underlyingBalance > 0n;
  const hasConfidential = Boolean(wallet.confidentialTokenHandle);
  const hasSavings = Boolean(wallet.savingsHandle);

  const mintDone = hasPublic || hasConfidential || hasSavings;
  const wrapDone = hasConfidential || hasSavings;

  const current: 1 | 2 | 3 = wrapDone ? 3 : mintDone ? 2 : 1;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-heading">Add savings</h1>
        <p className="text-body text-white/65">
          Three steps, once. After this, adding more is a single encrypted transaction.
        </p>
      </header>

      <MintStep wallet={wallet} address={address} step={1} current={current} />
      <WrapStep wallet={wallet} address={address} step={2} current={current} />
      <DepositStep wallet={wallet} address={address} step={3} current={current} />

      <TestnetNotice />
    </div>
  );
}

type Wallet = ReturnType<typeof useWalletSnapshot>;
type StepState = "complete" | "current" | "locked";

function stepState(step: number, current: number): StepState {
  if (step < current) return "complete";
  if (step === current) return "current";
  return "locked";
}

function StepShell({
  index,
  title,
  state,
  summary,
  description,
  children,
}: {
  index: number;
  title: string;
  state: StepState;
  summary?: React.ReactNode;
  description: string;
  children: React.ReactNode;
}) {
  const [forceOpen, setForceOpen] = useState(false);
  const collapsed = state === "complete" && !forceOpen;

  if (collapsed) {
    return (
      <Card className="flex items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-3">
          <StatusPill state="verified">Done</StatusPill>
          <div>
            <p className="text-small font-medium">
              {index}. {title}
            </p>
            {summary ? <p className="text-caption text-white/50">{summary}</p> : null}
          </div>
        </div>
        <Button tone="ghost-dark" size="md" onClick={() => setForceOpen(true)}>
          Review
        </Button>
      </Card>
    );
  }

  return (
    <Card className={"space-y-4" + (state === "locked" ? " opacity-60" : "")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="tabular text-caption text-violet">Step {index}</p>
          <h2 className="mt-1 text-subheading">{title}</h2>
          <p className="mt-1.5 text-small text-white/60">{description}</p>
        </div>
        {state === "complete" ? <StatusPill state="verified">Done</StatusPill> : null}
      </div>
      {state === "locked" ? (
        <p className="text-small text-white/45">{summary}</p>
      ) : (
        children
      )}
    </Card>
  );
}

/**
 * Zama's registered USDC mock has a plain, public `mint(address,uint256)` — anyone can mint to any
 * address, capped at 1,000,000 tokens per call, with no per-address cooldown or lifetime allowance.
 * Serein's own `TestUSDC` (used on chains where no canonical Zama pair exists to resolve) instead
 * exposes a named `claim()` with both, since an open faucet on a token Serein itself controls needed
 * a guard against one address inflating the pool's aggregate weight. Same intent — "give a fresh
 * wallet test tokens" — different mechanics, so the button below has two implementations rather than
 * one that assumes a cooldown state that Zama's mock does not have.
 */
const ZAMA_MOCK_MINT_ABI = parseAbi(["function mint(address account, uint256 amount) external"]);
const FAUCET_AMOUNT = 1_000n * 10n ** BigInt(TOKEN_DECIMALS);

function MintStep({
  wallet,
  address,
  step,
  current,
}: {
  wallet: Wallet;
  address: `0x${string}`;
  step: number;
  current: number;
}) {
  const { writeContractAsync } = useWriteContract();
  const flow = useTxFlow();
  const addresses = deployment().addresses!;
  const { isZamaCanonical } = deployment();
  const token = publicTokenMetadata();
  const state = stepState(step, current);

  const cooldown = isZamaCanonical ? 0 : Number(wallet.faucetCooldown);
  const capped = isZamaCanonical ? false : wallet.faucetRemaining === 0n;

  return (
    <StepShell
      index={step}
      title={`Get ${TOKEN_SYMBOL}`}
      state={state}
      summary={`${formatTokenAmount(wallet.underlyingBalance)} ${TOKEN_SYMBOL} available`}
      description={
        isZamaCanonical
          ? "Zama's registered Sepolia mock USDC. A public mint, no cooldown."
          : "A public faucet token with no monetary value. One claim every four hours."
      }
    >
      <TokenIdentity token={token} size="sm" showAddress />

      <div className="flex flex-wrap items-center gap-4">
        <Button
          onClick={() =>
            void flow.run({
              send: () =>
                isZamaCanonical
                  ? writeContractAsync({
                      address: addresses.underlyingToken,
                      abi: ZAMA_MOCK_MINT_ABI,
                      functionName: "mint",
                      args: [address, FAUCET_AMOUNT],
                    })
                  : writeContractAsync({
                      address: addresses.underlyingToken,
                      abi: ABIS.underlying,
                      functionName: "claim",
                    }),
              onConfirmed: () => wallet.refetch(),
            })
          }
          disabled={flow.busy || cooldown > 0 || capped}
        >
          {cooldown > 0
            ? `Available in ${formatCountdown(cooldown)}`
            : `Mint 1,000 ${TOKEN_SYMBOL}`}
        </Button>

        <p className="text-small text-white/60">
          Wallet balance:{" "}
          <span className="tabular font-medium text-white">
            {formatTokenAmount(wallet.underlyingBalance)} {TOKEN_SYMBOL}
          </span>
        </p>
      </div>

      <p className="text-caption text-white/45">
        Public test token. Minting and balances are visible onchain. No monetary value.
      </p>

      {capped ? (
        <p className="text-small text-white/60">
          This address has reached the faucet&apos;s lifetime cap. The cap exists so one address
          cannot inflate the pool&apos;s aggregate weight until everyone else&apos;s odds round to
          nothing.
        </p>
      ) : null}

      <TxStatus phase={flow.phase} />
    </StepShell>
  );
}

function WrapStep({
  wallet,
  address,
  step,
  current,
}: {
  wallet: Wallet;
  address: `0x${string}`;
  step: number;
  current: number;
}) {
  const { writeContractAsync } = useWriteContract();
  const flow = useTxFlow();
  const [amount, setAmount] = useState("");
  const [approved, setApproved] = useState(false);
  const addresses = deployment().addresses!;
  const publicToken = publicTokenMetadata();
  const confidentialToken = confidentialTokenMetadata();
  const registryStatus = useRegistryStatus();
  const state = stepState(step, current);

  const parsed = parseTokenAmount(amount);
  const invalid = amount !== "" && parsed === null;
  const tooMuch = parsed !== null && parsed > wallet.underlyingBalance;

  if (state === "locked") {
    return (
      <StepShell
        index={step}
        title="Make private"
        state={state}
        summary={`Waiting for ${TOKEN_SYMBOL}`}
        description="Converts test USDC into its confidential form."
      >
        <div />
      </StepShell>
    );
  }

  return (
    <StepShell
      index={step}
      title="Make private"
      state={state}
      summary={`${confidentialToken.symbol} available`}
      description="Converts test USDC into its confidential form. Everything after this step is encrypted."
    >
      <div className="rounded-card border border-white/12 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-caption uppercase tracking-wide text-white/45">You send</p>
            <TokenIdentity token={publicToken} size="sm" />
          </div>
          <p className="text-small text-white/60">
            Balance{" "}
            <span className="tabular font-medium text-white">
              {formatTokenAmount(wallet.underlyingBalance)}
            </span>
          </p>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setApproved(false);
            }}
            placeholder="0.00"
            aria-invalid={invalid || tooMuch}
            className="min-h-12 w-full rounded-card border border-white/15 bg-abyss px-4 text-body text-white placeholder:text-white/30 focus:border-violet focus:outline-none"
          />
          <Button
            tone="ghost-dark"
            onClick={() =>
              setAmount(formatTokenAmount(wallet.underlyingBalance, { maximumFractionDigits: 6 }))
            }
          >
            Max
          </Button>
        </div>

        <p className="mt-3 text-center text-small text-white/40">↓ Make private</p>

        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-caption uppercase tracking-wide text-white/45">You receive</p>
            <TokenIdentity
              token={confidentialToken}
              registryStatus={registryStatus}
              size="sm"
            />
          </div>
          <p className="text-small text-white/60">
            ≈{" "}
            <span className="tabular font-medium text-white">
              {parsed !== null ? formatTokenAmount(parsed) : "0.00"}
            </span>
          </p>
        </div>
      </div>

      <div className="rounded-card border border-violet/30 bg-violet/[0.07] p-4">
        <p className="text-small text-white/80">
          This wrap crosses the public/private boundary. The amount wrapped is visible onchain.
          Once held as {confidentialToken.symbol}, confidential transfers and Serein balances use
          encrypted amounts.
        </p>
      </div>

      {invalid ? (
        <p role="alert" className="text-small text-white/80">
          Enter a number with at most six decimal places.
        </p>
      ) : null}
      {tooMuch ? (
        <p role="alert" className="text-small text-white/80">
          That is more than your public balance of {formatTokenAmount(wallet.underlyingBalance)}{" "}
          {TOKEN_SYMBOL}.
        </p>
      ) : null}

      <Button
        disabled={flow.busy || parsed === null || parsed === 0n || tooMuch}
        onClick={() =>
          void flow.run({
            send: async () => {
              // The wrapper pulls the ERC-20 itself, so it needs an allowance first. Approving the
              // exact amount rather than an unlimited allowance keeps the standing permission at
              // zero once the wrap completes. If an earlier attempt already approved this exact
              // amount and only the wrap step failed, skip re-approving — the allowance is still
              // sufficient.
              if (!approved) {
                await writeContractAsync({
                  address: addresses.underlyingToken,
                  abi: ABIS.underlying,
                  functionName: "approve",
                  args: [addresses.confidentialToken, parsed!],
                });
                setApproved(true);
              }
              return writeContractAsync({
                address: addresses.confidentialToken,
                abi: ABIS.confidential,
                functionName: "wrap",
                args: [address, parsed!],
              });
            },
            onConfirmed: () => {
              setAmount("");
              setApproved(false);
              wallet.refetch();
            },
          })
        }
      >
        Make private
      </Button>

      <p className="text-caption text-white/45">
        {approved
          ? "1/2 approved — 2/2 wrap into " + confidentialToken.symbol
          : `Two wallet prompts: 1/2 approve ${TOKEN_SYMBOL}, 2/2 wrap into ${confidentialToken.symbol}.`}
      </p>

      <TxStatus phase={flow.phase} />
    </StepShell>
  );
}

function DepositStep({
  wallet,
  address,
  step,
  current,
}: {
  wallet: Wallet;
  address: `0x${string}`;
  step: number;
  current: number;
}) {
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const flow = useTxFlow();
  const pool = usePoolSnapshot();
  const [amount, setAmount] = useState("");
  const [revealState, reveal] = useRevealState();
  const [encrypted, setEncrypted] = useState<{
    handle: `0x${string}`;
    proof: `0x${string}`;
  } | null>(null);
  const addresses = deployment().addresses!;
  const confidentialToken = confidentialTokenMetadata();
  const state = stepState(step, current);

  const revealedBalance = revealState.status === "revealed" ? revealState.value : null;
  const parsed = parseTokenAmount(amount);
  const invalid = amount !== "" && parsed === null;

  if (state === "locked") {
    return (
      <StepShell
        index={step}
        title="Deposit to Serein"
        state={state}
        summary={`Waiting for ${confidentialToken.symbol}`}
        description="Your amount is encrypted in this browser and sent as ciphertext."
      >
        <div />
      </StepShell>
    );
  }

  return (
    <StepShell
      index={step}
      title="Deposit to Serein"
      state={state}
      description="Your amount is encrypted in this browser and sent as ciphertext. The pool computes on it without ever reading it."
    >
      <div className="space-y-2">
        <p className="text-caption uppercase tracking-wide text-white/45">Amount to deposit</p>
        <PrivateValue
          size="body"
          label="Confidential wallet balance"
          state={revealState}
          disabled={!wallet.confidentialTokenHandle}
          revealLabel="Reveal private balance"
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
              {formatTokenAmount(value)} <span className="text-body text-white/50">{PRIVATE_TOKEN_SYMBOL}</span>
            </>
          )}
        />

        <div className="flex gap-2">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setEncrypted(null);
            }}
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
          ) : (
            <p className="flex items-center whitespace-nowrap text-caption text-white/40">
              Reveal to use Max
            </p>
          )}
        </div>
      </div>

      {invalid ? (
        <p role="alert" className="text-small text-white/80">
          Enter a number with at most six decimal places.
        </p>
      ) : null}

      <div className="rounded-card border border-white/12 bg-white/[0.03] p-4 text-small">
        <DetailRow label="Destination" value="Serein Pool" />
        <DetailRow label="Asset" value={confidentialToken.symbol} />
        <DetailRow label="Amount" value="encrypted onchain" />
        <DetailRow label="Principal" value="withdrawable" />
        <DetailRow label="Current draw" value={`#${pool.currentDrawId.toString()}`} />
        <DetailRow
          label="Participation"
          value={wallet.savingsHandle ? "already registered" : "registers automatically"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={flow.busy || parsed === null || parsed === 0n}
          onClick={() => {
            // Encrypt once, in `prepare`, and hand the result to `send` through a holder rather than
            // through React state — state set during `prepare` would not be visible to `send`, which
            // runs in the same tick, and re-encrypting would double the slowest part of the flow.
            const prepared: { handle?: `0x${string}`; proof?: `0x${string}` } = {};
            void flow.run({
              prepare: async () => {
                const instance = await getFheInstance();
                const input = await instance
                  .createEncryptedInput(addresses.confidentialToken, address)
                  .add64(parsed!)
                  .encrypt();
                const handle = input.handles[0];
                if (!handle) throw new Error("The encryption step returned no ciphertext handle.");
                prepared.handle = toHex(handle);
                prepared.proof = toHex(input.inputProof);
                setEncrypted({ handle: prepared.handle, proof: prepared.proof });
              },
              send: () => {
                if (!prepared.handle || !prepared.proof) {
                  throw new Error("The encrypted input was not ready.");
                }
                // `confidentialTransferAndCall` hands the pool the amount that actually moved,
                // through the ERC-7984 receiver callback. That avoids granting the pool a standing
                // operator permission over the confidential token, which a plain transfer would
                // otherwise require.
                return writeContractAsync({
                  address: addresses.confidentialToken,
                  abi: ABIS.confidential,
                  functionName: "confidentialTransferAndCall",
                  args: [addresses.pool, prepared.handle, prepared.proof, "0x"],
                });
              },
              onConfirmed: () => {
                setAmount("");
                setEncrypted(null);
                wallet.refetch();
              },
            });
          }}
        >
          Deposit to Serein
        </Button>

        {encrypted ? (
          <Badge tone="violet">◆ Encrypted locally</Badge>
        ) : (
          <p className="text-caption text-white/45">Encrypting amount locally… before your wallet opens.</p>
        )}
      </div>

      <TxStatus phase={flow.phase} />

      {flow.phase.status === "confirmed" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-white/12 bg-white/[0.04] p-4">
          <p className="text-small">
            Savings added. Your deposited amount is now held as encrypted principal in Serein.
          </p>
          <ButtonLink href="/app" tone="ghost-dark">
            View position
          </ButtonLink>
        </div>
      ) : null}
    </StepShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-white/55">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}
