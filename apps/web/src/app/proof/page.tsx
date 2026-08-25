"use client";

import Link from "next/link";

import { DrawStatusPill } from "@/components/draw-progress";
import { Card, DataRow, SectionHeading, StatusPill } from "@/components/ui";
import { deployment, explorerAddress } from "@/lib/chain";
import { formatTimestamp, formatWeight, truncateAddress } from "@/lib/format";
import { anonymitySetWarning, useDeployment, usePoolSnapshot } from "@/lib/hooks/use-serein";
import { DrawStatus } from "@serein/protocol-sdk";

/**
 * The protocol proof dashboard.
 *
 * Written for someone whose job is to disbelieve it. Every row states what is public, what stays
 * encrypted, and where to check — and the page never decrypts an individual value to make the
 * demonstration easier, because doing so would be demonstrating a different protocol.
 */
export default function ProofPage() {
  const state = useDeployment();
  const pool = usePoolSnapshot();

  if (!state.ready) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
        <h1 className="text-heading">No deployment to verify</h1>
        <p className="text-body text-white/65">
          This build carries no Sepolia addresses, so there is nothing live to check yet.
        </p>
      </div>
    );
  }

  const addresses = deployment().addresses!;
  const warning = anonymitySetWarning(pool.participantCount);

  return (
    <div className="space-y-12">
      <SectionHeading
        eyebrow="Proof view"
        title="Check the claims against the chain."
        lead="Serein publishes exactly one number per draw that could be considered sensitive, and it is a sum. Everything below is read live from Sepolia."
      />

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card surface="deep" className="p-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-subheading">Current draw</h2>
            {pool.draw ? <DrawStatusPill status={pool.draw.status} /> : null}
          </div>

          {pool.draw ? (
            <dl className="mt-5">
              <DataRow label="Draw">#{pool.currentDrawId.toString()}</DataRow>
              <DataRow label="Epoch opens">{formatTimestamp(pool.draw.startTimestamp)}</DataRow>
              <DataRow label="Epoch closes">{formatTimestamp(pool.draw.endTimestamp)}</DataRow>
              <DataRow label="Participants">
                <span className="tabular">{pool.participantCount}</span>
              </DataRow>
              <DataRow label="Individual balances">
                <StatusPill state="encrypted">Encrypted</StatusPill>
              </DataRow>
              <DataRow label="Individual draw weights">
                <StatusPill state="encrypted">Encrypted</StatusPill>
              </DataRow>
              <DataRow
                label="Aggregate draw weight"
                hint="Published only after the epoch is frozen, and only as a sum."
              >
                {pool.draw.totalVerified ? (
                  <span className="tabular">{formatWeight(pool.draw.verifiedTotalWeight)}</span>
                ) : pool.draw.status === DrawStatus.Open ? (
                  <StatusPill state="pending">Not yet frozen</StatusPill>
                ) : (
                  <StatusPill state="pending">Awaiting KMS proof</StatusPill>
                )}
              </DataRow>
              <DataRow label="Random target">
                <StatusPill state="encrypted">Encrypted</StatusPill>
              </DataRow>
              <DataRow label="Winner">
                <StatusPill state="encrypted">Encrypted</StatusPill>
              </DataRow>
              <DataRow label="Principal spent on prizes">
                <span className="tabular">0</span>
              </DataRow>
            </dl>
          ) : (
            <p className="mt-4 text-small text-white/60">Reading the current draw…</p>
          )}

          <Link
            href={`/proof/draws/${pool.currentDrawId}`}
            className="mt-6 inline-block text-small text-violet underline underline-offset-4"
          >
            Open the full transcript →
          </Link>
        </Card>

        <div className="space-y-5">
          <Card className="p-7">
            <h2 className="text-subheading">What the protocol never reveals</h2>
            <ul className="mt-4 space-y-3 text-small text-white/70">
              {[
                "An individual savings balance, to anyone but its owner.",
                "An individual's historical balance — not even to that individual, because two points would reconstruct it.",
                "An individual draw weight, or the odds derived from it.",
                "The random target, at any point, to any address.",
                "Which participant won.",
                "How large the prize was.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-pill bg-violet"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-7">
            <h2 className="text-subheading">Try to break it</h2>
            <p className="mt-3 text-small text-white/70">
              The transcript page prints the raw ciphertext handle for the random target. Take it,
              ask the Zama relayer to decrypt it, and watch it refuse — the handle was never marked
              publicly decryptable and was never granted to any address. The same holds for any
              saver&apos;s balance handle from a wallet that is not theirs.
            </p>
            <p className="mt-3 text-caption text-white/45">
              The adversarial test suite does exactly this on every run, and fails the build if any
              of it ever succeeds.
            </p>
          </Card>
        </div>
      </div>

      {warning ? (
        <Card className="border-violet/30 bg-violet/[0.07]">
          <h2 className="text-subheading">Anonymity set caveat</h2>
          <p className="mt-2 text-small text-white/70">{warning}</p>
          <p className="mt-2 text-small text-white/55">
            Serein states this rather than hiding it. The aggregate is a genuine disclosure, and
            with very few savers it is a large one.
          </p>
        </Card>
      ) : null}

      <section className="space-y-5">
        <SectionHeading
          eyebrow="Deployment"
          title="Live contracts"
          lead="Every address the app uses comes from one committed manifest, stamped with the commit it was deployed from."
        />
        <Card surface="deep" className="p-7">
          <dl>
            <DataRow label="Commit">
              <span className="font-mono text-caption">{state.commit.slice(0, 12)}</span>
            </DataRow>
            <DataRow label="Deployed">{state.deployedAt || "—"}</DataRow>
            <DataRow label="Draw cadence">
              <span className="tabular">{state.drawDurationSeconds}s</span>
            </DataRow>
            {Object.entries({
              "Savings pool": addresses.pool,
              "Prize reserve": addresses.prizeReserve,
              "Prize source": addresses.prizeSource,
              "Test USDC": addresses.underlyingToken,
              "Private test USDC": addresses.confidentialToken,
            }).map(([label, address]) => (
              <DataRow key={label} label={label}>
                <a
                  href={explorerAddress(address)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-mono text-caption text-violet underline underline-offset-4"
                >
                  {truncateAddress(address, 10, 8)}
                </a>
              </DataRow>
            ))}
          </dl>
        </Card>
      </section>
    </div>
  );
}
