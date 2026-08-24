"use client";

import Link from "next/link";
import { use } from "react";
import { useAccount, useSignTypedData, useWriteContract } from "wagmi";

import { DrawCountdown, DrawProgress, DrawStatusPill } from "@/components/draw-progress";
import { PrivateValue, useRevealState } from "@/components/private-value";
import { TxStatus } from "@/components/tx-status";
import { Button, ButtonLink, Card, DataRow, StatusPill } from "@/components/ui";
import { deployment } from "@/lib/chain";
import { revealValue } from "@/lib/fhe/reveal";
import { formatTimestamp, formatWeight, PRIVATE_TOKEN_SYMBOL, formatTokenAmount } from "@/lib/format";
import { ABIS, useDeployment, useDraw, useDrawResult } from "@/lib/hooks/use-serein";
import { useTxFlow } from "@/lib/hooks/use-tx-flow";
import { DrawStatus } from "@serein/protocol-sdk";

/**
 * One draw, from a saver's point of view.
 *
 * The tone here matters more than anywhere else in the product. A non-winning draw is not a loss —
 * the saver's principal is exactly where they left it — and the copy says so plainly rather than
 * using the language of near-misses. Nothing on this page congratulates, commiserates, animates a
 * wheel, or otherwise borrows from gambling.
 */
export default function DrawDetailPage({ params }: { params: Promise<{ drawId: string }> }) {
  const { drawId: drawIdParam } = use(params);
  const parsed = /^\d+$/.test(drawIdParam) ? BigInt(drawIdParam) : null;
  const queryId = parsed ?? undefined;

  const { address, isConnected } = useAccount();
  const state = useDeployment();
  const { draw, isLoading } = useDraw(queryId);
  const result = useDrawResult(queryId);
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const flow = useTxFlow();
  const [revealState, reveal] = useRevealState();

  if (!state.ready) {
    return <p className="py-12 text-center text-body text-white/60">No deployment on this chain.</p>;
  }
  if (parsed === null) {
    return <p className="py-12 text-center text-body text-white/60">That is not a draw number.</p>;
  }
  if (isLoading) {
    return <p className="py-12 text-center text-body text-white/60">Loading draw #{drawIdParam}…</p>;
  }
  if (!draw || draw.status === DrawStatus.None) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <h1 className="text-heading">Draw #{drawIdParam} does not exist</h1>
        <ButtonLink href="/app/draws" tone="ghost-dark">
          Back to draws
        </ButtonLink>
      </div>
    );
  }

  const addresses = deployment().addresses!;
  const settled = draw.status === DrawStatus.Finalized;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-heading">Draw #{parsed.toString()}</h1>
        <DrawStatusPill status={draw.status} />
      </header>

      <Card surface="deep" className="p-7">
        <DrawProgress draw={draw} />
      </Card>

      {/* Your result — the only personal thing on this page, and it needs a signature to read. */}
      <Card className="space-y-4">
        <h2 className="text-subheading">Your result</h2>

        {!isConnected || !address ? (
          <p className="text-small text-white/60">Connect a wallet to see your result.</p>
        ) : !settled ? (
          <p className="text-small text-white/60">
            This draw has not finished. Results exist only once it does.
          </p>
        ) : !result.isCredited ? (
          <p className="text-small text-white/60">
            You were not registered when this draw closed, so it has no result for you. Your savings
            are unaffected.
          </p>
        ) : (
          <>
            <PrivateValue
              size="heading"
              label="Your result for this draw"
              revealLabel="Reveal result"
              state={revealState}
              disabled={!result.creditHandle}
              onReveal={() =>
                void reveal(() =>
                  revealValue({
                    user: address,
                    handle: result.creditHandle!,
                    contractAddress: addresses.prizeReserve,
                    alsoAuthorize: [addresses.pool, addresses.confidentialToken],
                    signTypedData: (args) =>
                      signTypedDataAsync(args as Parameters<typeof signTypedDataAsync>[0]),
                  }),
                )
              }
              render={(value) =>
                value > 0n ? (
                  <>
                    You won {formatTokenAmount(value)}{" "}
                    <span className="text-body text-white/50">{PRIVATE_TOKEN_SYMBOL}</span>
                  </>
                ) : (
                  <span className="text-subheading">
                    No prize this draw. Your savings are still intact.
                  </span>
                )
              }
            />

            <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
              {result.hasClaimed ? (
                <StatusPill state="verified">Collected</StatusPill>
              ) : (
                <Button
                  disabled={flow.busy}
                  onClick={() =>
                    void flow.run({
                      send: () =>
                        writeContractAsync({
                          address: addresses.prizeReserve,
                          abi: ABIS.reserve,
                          functionName: "claim",
                          args: [parsed],
                        }),
                      onConfirmed: () => result.refetch(),
                    })
                  }
                >
                  Collect result
                </Button>
              )}
              <p className="text-caption text-white/45">
                Everyone collects the same way. A non-winner moves an encrypted zero, so collecting
                does not tell anyone watching whether you won.
              </p>
            </div>

            <TxStatus phase={flow.phase} />
          </>
        )}
      </Card>

      <Card>
        <h2 className="text-subheading">What this draw published</h2>
        <dl className="mt-4">
          <DataRow label="Epoch">
            {formatTimestamp(draw.startTimestamp)} → {formatTimestamp(draw.endTimestamp)}
          </DataRow>
          {draw.status === DrawStatus.Open ? (
            <DataRow label="Ends in">
              <DrawCountdown endTimestamp={draw.endTimestamp} />
            </DataRow>
          ) : null}
          <DataRow label="Savers">
            <span className="tabular">{draw.participantCount}</span>
          </DataRow>
          <DataRow
            label="Total draw weight"
            hint="A sum across everyone. Published so the draw can be exactly fair."
          >
            {draw.totalVerified ? (
              <span className="tabular">{formatWeight(draw.verifiedTotalWeight)}</span>
            ) : (
              <StatusPill state="pending">Not yet</StatusPill>
            )}
          </DataRow>
          <DataRow label="Your draw weight">
            <StatusPill state="encrypted">Private</StatusPill>
          </DataRow>
          <DataRow label="Winner">
            <StatusPill state="encrypted">Encrypted</StatusPill>
          </DataRow>
          <DataRow label="Prize">
            <StatusPill state="encrypted">Encrypted</StatusPill>
          </DataRow>
        </dl>

        <Link
          href={`/proof/draws/${parsed}`}
          className="mt-5 inline-block text-small text-violet underline underline-offset-4"
        >
          See the full transcript and the transaction behind each step →
        </Link>
      </Card>
    </div>
  );
}
