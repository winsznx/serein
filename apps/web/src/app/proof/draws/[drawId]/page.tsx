"use client";

import { use } from "react";
import Link from "next/link";

import { DrawProgress, DrawStatusPill } from "@/components/draw-progress";
import { Card, SectionHeading, StatusPill } from "@/components/ui";
import { explorerTx } from "@/lib/chain";
import { formatTimestamp, formatWeight } from "@/lib/format";
import { useDeployment, useDraw, useDrawHandles } from "@/lib/hooks/use-serein";
import { useDrawTranscript, type TranscriptEntry } from "@/lib/hooks/use-transcript";
import { DrawStatus } from "@serein/protocol-sdk";

/**
 * The full transcript of one draw.
 *
 * The design goal is that a reader can follow the whole mechanism in under a minute and check every
 * step against a transaction. Each row states the claim, whether the value behind it is public or
 * encrypted, and which transaction settled it.
 */
export default function ProofDrawPage({ params }: { params: Promise<{ drawId: string }> }) {
  const { drawId: drawIdParam } = use(params);
  const drawId = safeBigInt(drawIdParam);
  // Hooks run unconditionally; `undefined` keeps their queries disabled for a malformed route param.
  const queryId = drawId ?? undefined;

  const state = useDeployment();
  const { draw, isLoading } = useDraw(queryId);
  const { handles } = useDrawHandles(queryId);
  const transcript = useDrawTranscript(queryId);

  if (!state.ready) {
    return <p className="py-12 text-center text-body text-white/60">No deployment to verify.</p>;
  }
  if (drawId === null) {
    return <p className="py-12 text-center text-body text-white/60">That is not a draw number.</p>;
  }
  if (isLoading) {
    return <p className="py-12 text-center text-body text-white/60">Reading draw #{drawIdParam}…</p>;
  }
  if (!draw || draw.status === DrawStatus.None) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <h1 className="text-heading">Draw #{drawIdParam} does not exist</h1>
        <Link href="/proof" className="text-small text-violet underline underline-offset-4">
          Back to the proof view
        </Link>
      </div>
    );
  }

  const byEvent = (name: string): TranscriptEntry | undefined =>
    transcript.data?.find((entry) => entry.event === name);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          eyebrow={`Draw #${drawId.toString()}`}
          title="Draw transcript"
          lead="Each line is a claim, its disclosure status, and the transaction that settled it."
        />
        <DrawStatusPill status={draw.status} />
      </div>

      <Card surface="deep" className="p-7">
        <DrawProgress draw={draw} />
      </Card>

      <section className="space-y-4">
        <h2 className="text-heading-sm">What this draw discloses</h2>
        <Card surface="deep" className="p-7">
          <dl>
            <ProofRow
              label="Epoch"
              disclosure="public"
              value={`${formatTimestamp(draw.startTimestamp)} → ${formatTimestamp(draw.endTimestamp)}`}
              note="Frozen at close. A balance change after this window cannot move a weight inside it."
              entry={byEvent("DrawOpened")}
            />
            <ProofRow
              label="Participants"
              disclosure="public"
              value={String(draw.participantCount)}
              note="The registry is public and ordered so the walk is deterministic and auditable."
              entry={byEvent("DrawClosed")}
            />
            <ProofRow
              label="Individual balances"
              disclosure="encrypted"
              value="euint64, per saver"
              note="Readable only by the saver, through an EIP-712 authorisation they sign themselves."
            />
            <ProofRow
              label="Individual draw weights"
              disclosure="encrypted"
              value="euint128, per saver"
              note="Computed under encryption from the time-weighted balance series. Never decrypted."
            />
            <ProofRow
              label="Aggregate draw weight"
              disclosure="public"
              value={
                draw.totalVerified ? formatWeight(draw.verifiedTotalWeight) : "Awaiting KMS proof"
              }
              note="The one deliberate disclosure. Sampling uniformly over an arbitrary total needs it in the clear; without it the draw would have to approximate, and an approximate draw is not a fair one."
              entry={byEvent("TotalWeightVerified")}
              handle={handles?.aggregateWeight}
            />
            <ProofRow
              label="Aggregate proof"
              disclosure="verified"
              value={draw.totalVerified ? "Verified by FHE.checkSignatures" : "Pending"}
              note="An untrusted caller submits the cleartext plus the KMS signature; the contract rejects any pair the KMS did not sign for this exact handle."
              entry={byEvent("TotalWeightVerified")}
            />
            <ProofRow
              label="Randomness bound"
              disclosure="public"
              value={draw.randomBound > 0n ? formatWeight(draw.randomBound) : "—"}
              note="nextPowerOfTwo(total). Derived publicly, because the coprocessor's bounded randomness only accepts a power of two."
            />
            <ProofRow
              label="Random target"
              disclosure="encrypted"
              value="euint128"
              note="Never made publicly decryptable and never granted to any address. Take the handle and try — the relayer will refuse."
              handle={handles?.randomTarget}
            />
            <ProofRow
              label="Candidates drawn"
              disclosure="public"
              value={String(draw.randomAttempts)}
              note={
                draw.randomAttempts > 1
                  ? "More than one candidate means earlier draws landed above the total and were discarded. That is the rejection step preserving exact uniformity, not a retry after an error."
                  : "The first candidate landed inside the usable range."
              }
              entry={byEvent("RandomCandidateAccepted")}
            />
            <ProofRow
              label="Selection progress"
              disclosure="public"
              value={`${draw.selectionCursor} / ${draw.participantCount}`}
              note="A monotonic cursor. Each participant is visited exactly once; a batch that reverts leaves it unmoved."
              entry={byEvent("SelectionBatchProcessed")}
            />
            <ProofRow
              label="Prefix equals aggregate"
              disclosure="verified"
              value={draw.consistencyVerified ? "Verified" : "Pending"}
              note="Proves the encrypted walk summed to exactly the published total — nobody skipped, nobody counted twice."
              entry={byEvent("DrawFinalized")}
              handle={handles?.pendingConsistency}
            />
            <ProofRow
              label="Winner"
              disclosure="encrypted"
              value="ebool, per participant"
              note="Everyone can call the same claim function, and a non-winner moves an encrypted zero, so claiming does not disclose the outcome."
            />
            <ProofRow
              label="Prize"
              disclosure="encrypted"
              value="euint64"
              note="Allocated to the draw as an encrypted input and credited under encryption."
            />
            <ProofRow
              label="Principal spent on prizes"
              disclosure="public"
              value="0"
              note="Structural. The prize reserve holds no principal and the savings pool has no function that spends prize funds."
            />
          </dl>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-heading-sm">Transactions</h2>
        {transcript.isLoading ? (
          <p className="text-small text-white/60">Reading logs…</p>
        ) : transcript.data && transcript.data.length > 0 ? (
          <Card surface="deep" className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <caption className="sr-only">On-chain events for draw {drawId.toString()}</caption>
              <thead>
                <tr className="border-b border-white/10 text-caption text-white/50">
                  <th scope="col" className="px-5 py-3 font-medium">
                    Step
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Block
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Transaction
                  </th>
                </tr>
              </thead>
              <tbody>
                {transcript.data.map((entry) => (
                  <tr
                    key={`${entry.txHash}-${entry.event}`}
                    className="border-b border-white/10 last:border-b-0"
                  >
                    <th scope="row" className="px-5 py-3 text-small font-normal">
                      {humanise(entry.event)}
                    </th>
                    <td className="tabular px-5 py-3 text-small text-white/60">
                      {entry.blockNumber.toString()}
                    </td>
                    <td className="px-5 py-3">
                      <a
                        href={explorerTx(entry.txHash)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-mono text-caption text-violet underline underline-offset-4"
                      >
                        {entry.txHash.slice(0, 10)}…{entry.txHash.slice(-8)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <p className="text-small text-white/60">
            No events yet for this draw, or the RPC provider did not return logs.
          </p>
        )}
      </section>
    </div>
  );
}

function ProofRow({
  label,
  disclosure,
  value,
  note,
  entry,
  handle,
}: {
  label: string;
  disclosure: "public" | "encrypted" | "verified";
  value: string;
  note: string;
  entry?: TranscriptEntry;
  handle?: `0x${string}` | null;
}) {
  return (
    <div className="border-b border-white/10 py-4 last:border-b-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <dt className="text-small text-white/60">{label}</dt>
        <dd className="flex flex-wrap items-center gap-2 sm:justify-end">
          <StatusPill state={disclosure}>
            {disclosure === "public" ? "Public" : disclosure === "encrypted" ? "Encrypted" : "Verified"}
          </StatusPill>
          <span className="tabular text-small font-medium">{value}</span>
        </dd>
      </div>
      <p className="mt-1.5 max-w-3xl text-caption text-white/45">{note}</p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {handle ? (
          <p className="truncate-hex font-mono text-caption text-white/35">handle {handle}</p>
        ) : null}
        {entry ? (
          <a
            href={explorerTx(entry.txHash)}
            target="_blank"
            rel="noreferrer noopener"
            className="text-caption text-violet underline underline-offset-4"
          >
            proving transaction
          </a>
        ) : null}
      </div>
    </div>
  );
}

function humanise(event: string): string {
  const map: Record<string, string> = {
    DrawOpened: "Draw opened",
    DrawClosed: "Closed, aggregate frozen and published",
    TotalWeightVerified: "Aggregate proof verified on chain",
    RandomCandidateGenerated: "Encrypted random candidate drawn",
    RandomCandidateRejected: "Candidate rejected, discarded",
    RandomCandidateAccepted: "Candidate accepted, target locked",
    SelectionBatchProcessed: "Selection batch walked",
    ConsistencyRequested: "Consistency check published",
    DrawFinalized: "Finalized",
  };
  return map[event] ?? event;
}

function safeBigInt(value: string): bigint | null {
  if (!/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}
