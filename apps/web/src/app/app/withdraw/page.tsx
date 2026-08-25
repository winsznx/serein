"use client";

import { useState } from "react";
import { useAccount, useSignTypedData, useWriteContract } from "wagmi";

import { PrivateValue, useRevealState } from "@/components/private-value";
import { TxStatus } from "@/components/tx-status";
import { Button, ButtonLink, Card } from "@/components/ui";
import { ConnectButton, TestnetNotice } from "@/components/wallet";
import { deployment } from "@/lib/chain";
import { revealValue } from "@/lib/fhe/reveal";
import { getFheInstance, toHex } from "@/lib/fhe/sdk";
import { formatTokenAmount, parseTokenAmount, PRIVATE_TOKEN_SYMBOL } from "@/lib/format";
import { ABIS, useDeployment, usePoolSnapshot, useWalletSnapshot } from "@/lib/hooks/use-serein";
import { useTxFlow } from "@/lib/hooks/use-tx-flow";
import { DRAW_STATUS, DrawStatus } from "@serein/protocol-sdk";

/**
 * Taking savings back out.
 *
 * Two things this screen has to get right.
 *
 * Withdrawals never wait on a draw. Whatever stage the protocol is in — closed, mid-selection, a
 * proof outstanding, every keeper offline — principal comes out. The screen says so explicitly,
 * because a saver who arrives during a draw and sees a progress bar will reasonably assume their
 * money is locked, and it is not.
 *
 * Over-withdrawing is clamped, not rejected. Reverting on "amount exceeds balance" would turn every
 * failed transaction into a probe against a balance the protocol is supposed to keep private, so the
 * contract takes whatever is actually there. Revealing your balance first is a convenience for
 * getting the number right, never a requirement.
 */
export default function WithdrawPage() {
  const { isConnected, address } = useAccount();
  const state = useDeployment();
  const wallet = useWalletSnapshot();
  const pool = usePoolSnapshot();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const flow = useTxFlow();
  const [revealState, reveal] = useRevealState();
  const [amount, setAmount] = useState("");

  if (!state.ready) {
    return (
      <p className="py-12 text-center text-body text-white/60">
        Serein has no deployment on this chain yet.
      </p>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-12 text-center">
        <h1 className="text-heading">Connect to take out savings</h1>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  const addresses = deployment().addresses!;
  const parsed = parseTokenAmount(amount);
  const invalid = amount !== "" && parsed === null;
  const revealedBalance = revealState.status === "revealed" ? revealState.value : null;
  const overBalance = revealedBalance !== null && parsed !== null && parsed > revealedBalance;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-heading">Take out savings</h1>
        <p className="text-body text-white/65">
          Your principal is yours at any time. Withdrawing does not affect a draw already in
          progress, and it never costs you the weight you already earned in it.
        </p>
      </header>

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
          <span className="text-small text-white/70">Amount to take out</span>
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
                All
              </Button>
            ) : null}
          </div>
        </label>

        {invalid ? (
          <p role="alert" className="text-small text-white/80">
            Enter a number with at most six decimal places.
          </p>
        ) : null}

        {overBalance ? (
          <p role="alert" className="text-small text-white/80">
            That is more than your revealed balance. You can still send it — the contract will take
            your whole balance and no more — but you probably meant a smaller number.
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
          Take out savings
        </Button>

        <p className="text-caption text-white/45">
          The amount you enter is encrypted before it leaves this browser, so the withdrawal amount
          is not visible on chain either.
        </p>

        <TxStatus phase={flow.phase} />

        {flow.phase.status === "confirmed" ? (
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-white/12 bg-white/[0.04] p-4">
            <p className="text-small">
              Sent back to your confidential balance. To convert it to public test USDC, unwrap it —
              that step is public.
            </p>
            <ButtonLink href="/app" tone="ghost-dark">
              Back to savings
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
            {DRAW_STATUS[pool.draw.status].consumer.toLowerCase()}. Its weights were frozen when it
            closed, so taking savings out now neither reduces nor increases the entry you already
            have in it. Withdrawals stay open at every stage.
          </p>
        </Card>
      ) : null}

      <TestnetNotice />
    </div>
  );
}
