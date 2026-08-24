"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useReadContracts } from "wagmi";

import { DrawCountdown, DrawStatusPill } from "@/components/draw-progress";
import { Card, StatusPill } from "@/components/ui";
import { CHAIN_ID } from "@/lib/chain";
import { formatTimestamp, formatCompactWeight } from "@/lib/format";
import { ABIS, useDeployment, usePoolSnapshot } from "@/lib/hooks/use-serein";
import { DrawStatus, toDrawView, type DrawView } from "@serein/protocol-sdk";

/**
 * Draw history.
 *
 * Deliberately shows nothing per-saver. Whether a given address won a given draw is exactly the
 * thing the protocol keeps encrypted, so a history list that implied otherwise would be lying about
 * its own product. Personal results live on the draw detail page, behind a reveal that only the
 * owner can perform.
 */
export default function DrawsPage() {
  const state = useDeployment();
  const pool = usePoolSnapshot();

  const ids = useMemo(() => {
    const current = Number(pool.currentDrawId);
    if (current === 0) return [];
    const newest = current;
    const oldest = Math.max(1, newest - 19);
    const out: bigint[] = [];
    for (let id = newest; id >= oldest; id--) out.push(BigInt(id));
    return out;
  }, [pool.currentDrawId]);

  const { data, isLoading } = useReadContracts({
    allowFailure: true,
    contracts: state.ready
      ? ids.map((id) => ({
          address: state.addresses!.pool,
          abi: ABIS.pool,
          functionName: "getDraw" as const,
          args: [id] as const,
          chainId: CHAIN_ID,
        }))
      : [],
    query: { enabled: state.ready && ids.length > 0 },
  });

  if (!state.ready) {
    return (
      <p className="py-12 text-center text-body text-white/60">
        Serein has no deployment on this chain yet.
      </p>
    );
  }

  const draws = ids
    .map((id, index) => {
      const entry = data?.[index];
      if (!entry || entry.status !== "success") return null;
      return { id, draw: toDrawView(entry.result as unknown as readonly unknown[]) };
    })
    .filter((entry): entry is { id: bigint; draw: DrawView } => entry !== null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-heading">Draws</h1>
        <p className="text-body text-white/65">
          Every draw and what it published. Individual results are not listed here — they are
          encrypted, and only you can reveal your own.
        </p>
      </header>

      {isLoading && draws.length === 0 ? (
        <p className="text-small text-white/60">Reading draw history…</p>
      ) : null}

      <ul className="space-y-3">
        {draws.map(({ id, draw }) => (
          <li key={id.toString()}>
            <Link href={`/app/draws/${id}`} className="block">
              <Card className="transition-colors hover:border-white/25">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-subheading">Draw #{id.toString()}</h2>
                    <DrawStatusPill status={draw.status} />
                  </div>
                  {draw.status === DrawStatus.Open ? (
                    <p className="text-small text-white/60">
                      ends in <DrawCountdown endTimestamp={draw.endTimestamp} />
                    </p>
                  ) : (
                    <p className="text-small text-white/50">
                      {formatTimestamp(draw.endTimestamp)}
                    </p>
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                  <div>
                    <dt className="text-caption text-white/45">Savers</dt>
                    <dd className="tabular mt-0.5 text-small">{draw.participantCount}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-white/45">Total weight</dt>
                    <dd className="tabular mt-0.5 text-small">
                      {draw.totalVerified ? formatCompactWeight(draw.verifiedTotalWeight) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption text-white/45">Candidates</dt>
                    <dd className="tabular mt-0.5 text-small">{draw.randomAttempts || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-white/45">Winner</dt>
                    <dd className="mt-0.5">
                      {draw.status === DrawStatus.Finalized ? (
                        draw.hasWinner ? (
                          <StatusPill state="encrypted">Encrypted</StatusPill>
                        ) : (
                          <StatusPill state="pending">No entries</StatusPill>
                        )
                      ) : (
                        <StatusPill state="pending">Pending</StatusPill>
                      )}
                    </dd>
                  </div>
                </dl>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      {draws.length === 0 && !isLoading ? (
        <p className="text-small text-white/60">No draws yet.</p>
      ) : null}
    </div>
  );
}
