"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { Card, StatusPill } from "@/components/ui";
import { ConnectButton, useWalletStatus } from "@/components/wallet";
import { deployment, explorerTx } from "@/lib/chain";
import { estimateBlockForTimestamp, fetchLogsInWindows } from "@/lib/chain-logs";
import { getDeployment, SereinPoolAbi } from "@serein/protocol-sdk";

/**
 * Your activity on Serein.
 *
 * Every row is an action, never an amount. The chain records that you added savings; it does not
 * record how much, and this page will not invent a number to fill the column. Where a value exists
 * it is marked encrypted, which is both accurate and the clearest possible demonstration of what the
 * protocol does.
 *
 * Built from event logs rather than a database. There is no server-side history to trust or to go
 * stale — what you see is what the chain says, and every row links to the transaction.
 *
 * The log search is bounded by the wallet's own first observation, not the contract's deployment
 * block. Alchemy's free tier — what the deployed app runs on — rejects `eth_getLogs` outright past a
 * 10-block range, so a scan from deployment to `latest` (tens of thousands of blocks) never actually
 * ran; it silently failed and produced "Nothing yet" for wallets with real history. Every deposit
 * writes an observation, so `observationAt(address, 0)` is a single cheap read that pins down when
 * this wallet's history actually begins, without scanning for it.
 */
const EVENTS = [
  {
    item: parseAbiItem("event SavingsAdded(address indexed participant, uint256 indexed drawId)"),
    label: "Added savings",
    detail: "Amount encrypted",
  },
  {
    item: parseAbiItem(
      "event SavingsWithdrawn(address indexed participant, uint256 indexed drawId)",
    ),
    label: "Took out savings",
    detail: "Amount encrypted",
  },
  {
    item: parseAbiItem(
      "event ParticipantRegistered(address indexed participant, uint256 indexed index)",
    ),
    label: "Registered as a saver",
    detail: "Public",
  },
] as const;

const CLAIM_EVENT = parseAbiItem(
  "event PrizeClaimed(uint256 indexed drawId, address indexed participant)",
);

interface Row {
  label: string;
  detail: string;
  encrypted: boolean;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

export default function ActivityPage() {
  const { address, isConnected, isRestoring } = useWalletStatus();
  const publicClient = usePublicClient();
  const state = deployment();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["activity", address, state.commit],
    enabled: Boolean(publicClient && address && state.ready),
    staleTime: 15_000,
    queryFn: async (): Promise<Row[]> => {
      if (!publicClient || !address) return [];
      const manifest = getDeployment(11155111);
      const pool = manifest.contracts.SereinPool;
      const reserve = manifest.contracts.SereinPrizeReserve;
      if (!pool || !reserve) return [];
      const poolAddress = pool.address as `0x${string}`;
      const deployedAtBlock = BigInt(pool.deployedAtBlock);

      const observationCount = await publicClient.readContract({
        address: poolAddress,
        abi: SereinPoolAbi,
        functionName: "observationCount",
        args: [address],
      });

      // No observation ever written for this address means no savings history to find — the log
      // scan below would legitimately come back empty, so skip it rather than pay for it.
      if (observationCount === 0n) return [];

      const [firstObservation, latestBlock] = await Promise.all([
        publicClient.readContract({
          address: poolAddress,
          abi: SereinPoolAbi,
          functionName: "observationAt",
          args: [address, 0n],
        }),
        publicClient.getBlock({ blockTag: "latest" }),
      ]);
      const firstTimestamp = firstObservation[0];

      const deployedBlock = await publicClient.getBlock({ blockNumber: deployedAtBlock });
      const estimatedFrom = estimateBlockForTimestamp(
        firstTimestamp,
        { block: deployedAtBlock, timestamp: deployedBlock.timestamp },
        { block: latestBlock.number, timestamp: latestBlock.timestamp },
      );
      // Generous padding before the estimate, in case the first observation predates the wallet's
      // first *event* by a block or two (registration and the first deposit land in the same
      // transaction, but the estimate itself carries a small margin of error).
      const startPadding = 300n;
      const fromBlock =
        estimatedFrom - startPadding > deployedAtBlock
          ? estimatedFrom - startPadding
          : deployedAtBlock;

      const [poolLogs, claimLogs] = await Promise.all([
        fetchLogsInWindows(
          publicClient,
          poolAddress,
          EVENTS.map((event) => event.item),
          fromBlock,
          latestBlock.number,
        ),
        fetchLogsInWindows(
          publicClient,
          reserve.address as `0x${string}`,
          [CLAIM_EVENT],
          fromBlock,
          latestBlock.number,
        ),
      ]);

      const eventByName = new Map<string, (typeof EVENTS)[number]>(
        EVENTS.map((event) => [event.item.name, event]),
      );

      const rows: Row[] = [];
      for (const log of poolLogs) {
        const decoded = log as unknown as {
          eventName?: string;
          args?: { participant?: `0x${string}` };
          transactionHash: `0x${string}`;
          blockNumber: bigint;
        };
        if (!decoded.eventName) continue;
        if (decoded.args?.participant?.toLowerCase() !== address.toLowerCase()) continue;
        const event = eventByName.get(decoded.eventName);
        if (!event) continue;
        rows.push({
          label: event.label,
          detail: event.detail,
          encrypted: event.detail === "Amount encrypted",
          txHash: decoded.transactionHash,
          blockNumber: decoded.blockNumber,
        });
      }
      for (const log of claimLogs) {
        const decoded = log as unknown as {
          args?: { participant?: `0x${string}` };
          transactionHash: `0x${string}`;
          blockNumber: bigint;
        };
        if (decoded.args?.participant?.toLowerCase() !== address.toLowerCase()) continue;
        rows.push({
          label: "Collected a draw result",
          detail: "Outcome encrypted",
          encrypted: true,
          txHash: decoded.transactionHash,
          blockNumber: decoded.blockNumber,
        });
      }

      return rows.sort((a, b) => (a.blockNumber < b.blockNumber ? 1 : -1));
    },
  });

  if (!state.ready) {
    return (
      <p className="py-12 text-center text-body text-white/60">No deployment on this chain.</p>
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
        <h1 className="text-heading">Connect to see your activity</h1>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-heading">Activity</h1>
        <p className="text-body text-white/65">
          What this wallet did, taken from the chain. The actions are public. The amounts are not,
          and nothing here reconstructs them.
        </p>
      </header>

      {isLoading ? <p className="text-small text-white/60">Reading your history…</p> : null}
      {isError ? (
        <Card>
          <p className="text-small">
            Could not read logs from the RPC provider. Your funds are unaffected — this page is a
            read-only view, and it will fill in once the provider responds.
          </p>
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <ul className="space-y-2">
          {data.map((row) => (
            <li key={`${row.txHash}-${row.label}`}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-small font-medium">{row.label}</p>
                    <p className="mt-0.5 text-caption text-white/45">
                      block {row.blockNumber.toString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {row.encrypted ? (
                      <StatusPill state="encrypted">{row.detail}</StatusPill>
                    ) : (
                      <StatusPill state="public">{row.detail}</StatusPill>
                    )}
                    <a
                      href={explorerTx(row.txHash)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-caption text-violet underline underline-offset-4"
                    >
                      view
                    </a>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      {data && data.length === 0 && !isLoading ? (
        <p className="text-small text-white/60">
          Nothing yet. Once you add savings, your actions will appear here.
        </p>
      ) : null}
    </div>
  );
}
