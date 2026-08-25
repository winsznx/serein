"use client";

import { useState } from "react";
import { useWriteContract } from "wagmi";

import { TxStatus } from "@/components/tx-status";
import { Badge, Button, ButtonLink, Card, StatusPill } from "@/components/ui";
import { ConnectButton, TestnetNotice, useWalletStatus } from "@/components/wallet";
import { deployment } from "@/lib/chain";
import { getFheInstance, toHex } from "@/lib/fhe/sdk";
import { formatCountdown, formatTokenAmount, parseTokenAmount, TOKEN_SYMBOL } from "@/lib/format";
import { ABIS, useDeployment, useWalletSnapshot } from "@/lib/hooks/use-serein";
import { useTxFlow } from "@/lib/hooks/use-tx-flow";

/**
 * Getting money in: faucet, then wrap, then save.
 *
 * Three transactions, presented as three steps rather than one opaque button, because they do
 * genuinely different things and one of them changes what is public about you. The wrap step says so
 * in plain language instead of letting a saver discover it afterwards on a block explorer.
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-heading">Add savings</h1>
        <p className="text-body text-white/65">
          Three steps, once. After this, adding more is a single encrypted transaction.
        </p>
      </header>

      <FaucetStep wallet={wallet} />
      <WrapStep wallet={wallet} address={address} />
      <SaveStep wallet={wallet} address={address} />

      <TestnetNotice />
    </div>
  );
}

type Wallet = ReturnType<typeof useWalletSnapshot>;

function StepShell({
  index,
  title,
  done,
  children,
  description,
}: {
  index: number;
  title: string;
  done: boolean;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="tabular text-caption text-violet">Step {index}</p>
          <h2 className="mt-1 text-subheading">{title}</h2>
          <p className="mt-1.5 text-small text-white/60">{description}</p>
        </div>
        {done ? <StatusPill state="verified">Done</StatusPill> : null}
      </div>
      {children}
    </Card>
  );
}

function FaucetStep({ wallet }: { wallet: Wallet }) {
  const { writeContractAsync } = useWriteContract();
  const flow = useTxFlow();
  const addresses = deployment().addresses!;

  const cooldown = Number(wallet.faucetCooldown);
  const capped = wallet.faucetRemaining === 0n;

  return (
    <StepShell
      index={1}
      title="Get test USDC"
      done={wallet.underlyingBalance > 0n}
      description="A public faucet token with no monetary value. One claim every four hours."
    >
      <div className="flex flex-wrap items-center gap-4">
        <Button
          onClick={() =>
            void flow.run({
              send: () =>
                writeContractAsync({
                  address: addresses.underlyingToken,
                  abi: ABIS.underlying,
                  functionName: "claim",
                }),
              onConfirmed: () => wallet.refetch(),
            })
          }
          disabled={flow.busy || cooldown > 0 || capped}
        >
          {cooldown > 0 ? `Available in ${formatCountdown(cooldown)}` : "Get 1,000 test USDC"}
        </Button>

        <p className="text-small text-white/60">
          Balance:{" "}
          <span className="tabular font-medium text-white">
            {formatTokenAmount(wallet.underlyingBalance)} {TOKEN_SYMBOL}
          </span>
        </p>
      </div>

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

function WrapStep({ wallet, address }: { wallet: Wallet; address: `0x${string}` }) {
  const { writeContractAsync } = useWriteContract();
  const flow = useTxFlow();
  const [amount, setAmount] = useState("");
  const addresses = deployment().addresses!;

  const parsed = parseTokenAmount(amount);
  const invalid = amount !== "" && parsed === null;
  const tooMuch = parsed !== null && parsed > wallet.underlyingBalance;

  return (
    <StepShell
      index={2}
      title="Make it private"
      done={Boolean(wallet.confidentialTokenHandle) || Boolean(wallet.savingsHandle)}
      description="Converts test USDC into its confidential form. Everything after this step is encrypted."
    >
      <div className="rounded-card border border-violet/30 bg-violet/[0.07] p-4">
        <p className="text-small text-white/80">
          Be aware: this transaction is public. Anyone reading the chain can see the amount you
          wrap. What stays private is everything that happens afterwards — your savings balance,
          your draw weight, your odds, and your results.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-small text-white/70">Amount to make private</span>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
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
      </label>

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
              // zero once the wrap completes.
              const approvalHash = await writeContractAsync({
                address: addresses.underlyingToken,
                abi: ABIS.underlying,
                functionName: "approve",
                args: [addresses.confidentialToken, parsed!],
              });
              void approvalHash;
              return writeContractAsync({
                address: addresses.confidentialToken,
                abi: ABIS.confidential,
                functionName: "wrap",
                args: [address, parsed!],
              });
            },
            onConfirmed: () => {
              setAmount("");
              wallet.refetch();
            },
          })
        }
      >
        Make private
      </Button>

      <p className="text-caption text-white/45">
        Two wallet prompts: one to approve the exact amount, one to wrap it.
      </p>

      <TxStatus phase={flow.phase} />
    </StepShell>
  );
}

function SaveStep({ wallet, address }: { wallet: Wallet; address: `0x${string}` }) {
  const { writeContractAsync } = useWriteContract();
  const flow = useTxFlow();
  const [amount, setAmount] = useState("");
  const [encrypted, setEncrypted] = useState<{
    handle: `0x${string}`;
    proof: `0x${string}`;
  } | null>(null);
  const addresses = deployment().addresses!;

  const parsed = parseTokenAmount(amount);
  const invalid = amount !== "" && parsed === null;

  return (
    <StepShell
      index={3}
      title="Add savings"
      done={Boolean(wallet.savingsHandle)}
      description="Your amount is encrypted in this browser and sent as ciphertext. The pool computes on it without ever reading it."
    >
      <label className="block space-y-2">
        <span className="text-small text-white/70">Amount to save</span>
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
      </label>

      {invalid ? (
        <p role="alert" className="text-small text-white/80">
          Enter a number with at most six decimal places.
        </p>
      ) : null}

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
          Add to private savings
        </Button>

        {encrypted ? (
          <Badge tone="violet">◆ Encrypted locally</Badge>
        ) : (
          <p className="text-caption text-white/45">Encryption happens before your wallet opens.</p>
        )}
      </div>

      <TxStatus phase={flow.phase} />

      {flow.phase.status === "confirmed" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-white/12 bg-white/[0.04] p-4">
          <p className="text-small">Added to private savings.</p>
          <ButtonLink href="/app" tone="ghost-dark">
            Back to savings
          </ButtonLink>
        </div>
      ) : null}
    </StepShell>
  );
}
