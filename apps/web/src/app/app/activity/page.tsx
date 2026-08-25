"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { Card, StatusPill } from "@/components/ui";
import { ConnectButton } from "@/components/wallet";
import { deployment, explorerTx } from "@/lib/chain";
import { getDeployment } from "@serein/protocol-sdk";

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
  const { address, isConnected } = useAccount();
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
      const fromBlock = BigInt(pool.deployedAtBlock);

      const poolLogs = await Promise.all(
        EVENTS.map(async (event) => {
          const logs = await publicClient
            .getLogs({
              address: pool.address as `0x${string}`,
              event: event.item,
              args: { participant: address },
              fromBlock,
              toBlock: "latest",
            })
            .catch(() => []);
          return logs.map((log) => ({
            label: event.label,
            detail: event.detail,
            encrypted: event.detail === "Amount encrypted",
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          }));
        }),
      );

      const claimLogs = await publicClient
        .getLogs({
          address: reserve.address as `0x${string}`,
          event: CLAIM_EVENT,
          args: { participant: address },
          fromBlock,
          toBlock: "latest",
        })
        .catch(() => []);

      const rows: Row[] = [
        ...poolLogs.flat(),
        ...claimLogs.map((log) => ({
          label: "Collected a draw result",
          detail: "Outcome encrypted",
          encrypted: true,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        })),
      ];

      return rows.sort((a, b) => (a.blockNumber < b.blockNumber ? 1 : -1));
    },
  });

  if (!state.ready) {
    return (
      <p className="py-12 text-center text-body text-white/60">No deployment on this chain.</p>
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
