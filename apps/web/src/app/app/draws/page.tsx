"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";

import { DrawCountdown, DrawStatusPill } from "@/components/draw-progress";
import { ButtonLink, Card, StatusPill } from "@/components/ui";
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
type Filter = "all" | "open" | "complete" | "mine";

export default function DrawsPage() {
  const state = useDeployment();
  const pool = usePoolSnapshot();
  const { address } = useAccount();
  const [filter, setFilter] = useState<Filter>("all");

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

  // "My result ready" needs a real per-draw check, not a guess — batched the same way as the draws
  // themselves, only against finalized ones, since an open draw has no result to credit yet.
  const finalizedIds = ids.filter((_, index) => {
    const entry = data?.[index];
    return entry?.status === "success" && toDrawView(entry.result).status === DrawStatus.Finalized;
  });
  const { data: creditedData } = useReadContracts({
    allowFailure: true,
    contracts:
      state.ready && address
        ? finalizedIds.map((id) => ({
            address: state.addresses!.prizeReserve,
            abi: ABIS.reserve,
            functionName: "isCredited" as const,
            args: [id, address] as const,
            chainId: CHAIN_ID,
          }))
        : [],
    query: { enabled: state.ready && Boolean(address) && finalizedIds.length > 0 },
  });
  const creditedIds = new Set(
    finalizedIds.filter((_, index) => creditedData?.[index]?.status === "success" && creditedData[index]!.result === true).map((id) => id.toString()),
  );

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
      return { id, draw: toDrawView(entry.result) };
    })
    .filter((entry): entry is { id: bigint; draw: DrawView } => entry !== null);

  const active = draws.find(({ draw }) => draw.status === DrawStatus.Open);
  const history = draws.filter(({ id }) => id !== active?.id);

  const filtered = history.filter(({ id, draw }) => {
    if (filter === "all") return true;
    if (filter === "open") return draw.status !== DrawStatus.Finalized;
    if (filter === "complete") return draw.status === DrawStatus.Finalized;
    if (filter === "mine") return creditedIds.has(id.toString());
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-heading">Draws</h1>
        <p className="text-body text-white/65">
          Private weighted prize rounds, with public proof where Serein intentionally crosses the
          confidentiality boundary.
        </p>
      </header>

      {active ? <ActiveDrawPanel id={active.id} draw={active.draw} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "All"],
            ["open", "Open / processing"],
            ["complete", "Complete"],
            ["mine", "My result ready"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={
              "min-h-9 rounded-pill border px-3 text-caption font-medium transition-colors " +
              (filter === value
                ? "border-violet bg-violet/15 text-violet"
                : "border-white/12 text-white/55 hover:text-white")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && draws.length === 0 ? (
        <p className="text-small text-white/60">Reading draw history…</p>
      ) : null}

      <ul className="space-y-3">
        {filtered.map(({ id, draw }) => (
          <li key={id.toString()}>
            <HistoryRow id={id} draw={draw} highlight={creditedIds.has(id.toString())} />
          </li>
        ))}
      </ul>

      {draws.length === 0 && !isLoading ? (
        <p className="text-small text-white/60">No draws yet.</p>
      ) : null}
      {filtered.length === 0 && history.length > 0 ? (
        <p className="text-small text-white/60">No draws match this filter.</p>
      ) : null}
    </div>
  );
}

function candidateSummary(randomAttempts: number): string {
  if (randomAttempts <= 0) return "—";
  if (randomAttempts === 1) return "1";
  return `${randomAttempts - 1} rejected · 1 accepted`;
}

function ActiveDrawPanel({ id, draw }: { id: bigint; draw: DrawView }) {
  return (
    <Card surface="deep" className="space-y-5 border-violet/25 p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-subheading">Draw #{id.toString()}</h2>
          <DrawStatusPill status={draw.status} />
        </div>
        <p className="text-small text-white/60">
          ends in <DrawCountdown endTimestamp={draw.endTimestamp} />
        </p>
      </div>

      <DrawTimeRail startTimestamp={draw.startTimestamp} endTimestamp={draw.endTimestamp} />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <div>
          <dt className="text-caption text-white/45">Savers in this draw</dt>
          <dd className="tabular mt-0.5 text-small">{draw.participantCount}</dd>
        </div>
        <div>
          <dt className="text-caption text-white/45">Your draw weight</dt>
          <dd className="mt-0.5">
            <StatusPill state="encrypted">Private</StatusPill>
          </dd>
        </div>
        <div>
          <dt className="text-caption text-white/45">Prize</dt>
          <dd className="mt-0.5">
            <StatusPill state="encrypted">Private</StatusPill>
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-3 border-t border-white/10 pt-4">
        <ButtonLink href={`/app/draws/${id}`}>View draw</ButtonLink>
        <ButtonLink href={`/proof/draws/${id}`} tone="ghost-dark">
          Open proof
        </ButtonLink>
      </div>
    </Card>
  );
}

function DrawTimeRail({
  startTimestamp,
  endTimestamp,
}: {
  startTimestamp: bigint;
  endTimestamp: bigint;
}) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = now - Number(startTimestamp);
  const total = Math.max(1, Number(endTimestamp) - Number(startTimestamp));
  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));

  return (
    <div className="h-1.5 w-full rounded-pill bg-white/10" suppressHydrationWarning>
      <div className="h-full rounded-pill bg-violet transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function HistoryRow({
  id,
  draw,
  highlight,
}: {
  id: bigint;
  draw: DrawView;
  highlight?: boolean;
}) {
  return (
    <Card
      className={
        "transition-colors hover:border-white/25" + (highlight ? " border-violet/40" : "")
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-subheading">Draw #{id.toString()}</h2>
          <DrawStatusPill status={draw.status} />
        </div>
        <p className="text-small text-white/50">{formatTimestamp(draw.endTimestamp)}</p>
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
          <dt
            className="text-caption text-white/45"
            title="Serein rejects candidates outside the real aggregate range rather than scaling the distribution."
          >
            Random candidates
          </dt>
          <dd className="tabular mt-0.5 text-small">{candidateSummary(draw.randomAttempts)}</dd>
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

      <div className="mt-4 flex gap-2 border-t border-white/10 pt-4">
        <ButtonLink href={`/app/draws/${id}`} tone="ghost-dark" size="md">
          Details
        </ButtonLink>
        <ButtonLink href={`/proof/draws/${id}`} tone="ghost-dark" size="md">
          Proof
        </ButtonLink>
      </div>
    </Card>
  );
}
