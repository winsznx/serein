"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { CHAIN_ID, deployment } from "@/lib/chain";
import { estimateBlockForTimestamp, fetchLogsInWindows } from "@/lib/chain-logs";
import { ABIS } from "@/lib/hooks/use-serein";
import { getDeployment } from "@serein/protocol-sdk";

/**
 * A short, bounded preview of what this wallet has done — for the Overview page, not the full
 * ledger at `/app/activity`.
 *
 * Same anchor as the activity page's own query: `observationAt(address, 0)` pins down when this
 * wallet's history actually begins, so the scan never has to touch the whole deployment history to
 * find "the last three things." A previous version of this exact pattern (the proof view's draw
 * transcript, and this page's own predecessor) failed silently instead — a free-tier RPC's
 * `eth_getLogs` range cap rejected the wide query, a bare `.catch(() => [])` swallowed it, and the
 * page rendered "nothing happened" for a wallet with real history. This hook must never repeat that:
 * a fetch failure is a distinct state from an empty result, always.
 */
const EVENTS = [
  {
    item: parseAbiItem("event SavingsAdded(address indexed participant, uint256 indexed drawId)"),
    label: "Deposited to Serein",
  },
  {
    item: parseAbiItem(
      "event SavingsWithdrawn(address indexed participant, uint256 indexed drawId)",
    ),
    label: "Withdrew from Serein",
  },
  {
    item: parseAbiItem(
      "event ParticipantRegistered(address indexed participant, uint256 indexed index)",
    ),
    label: "Registered as a saver",
  },
] as const;

export interface ActivityPreviewRow {
  label: string;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

export interface RecentActivityResult {
  rows: ActivityPreviewRow[] | null;
  isLoading: boolean;
  /** `true` only when the fetch itself failed — never set merely because there were no events. */
  isError: boolean;
}

export function useRecentActivity(
  address: `0x${string}` | undefined,
  limit = 5,
): RecentActivityResult {
  const publicClient = usePublicClient();
  const state = deployment();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["recent-activity", address, state.commit],
    enabled: Boolean(publicClient && address && state.ready),
    staleTime: 15_000,
    queryFn: async (): Promise<ActivityPreviewRow[]> => {
      if (!publicClient || !address) return [];
      const pool = state.addresses!.pool;
      const manifest = getDeployment(CHAIN_ID);
      const poolEntry = manifest.contracts.SereinPool;
      if (!poolEntry) return [];
      const deployedAtBlock = BigInt(poolEntry.deployedAtBlock);

      const observationCount = (await publicClient.readContract({
        address: pool,
        abi: ABIS.pool,
        functionName: "observationCount",
        args: [address],
      })) as bigint;
      if (observationCount === 0n) return [];

      const [firstObservation, latestBlock, deployedBlock] = await Promise.all([
        publicClient.readContract({
          address: pool,
          abi: ABIS.pool,
          functionName: "observationAt",
          args: [address, 0n],
        }) as Promise<readonly [bigint, `0x${string}`, `0x${string}`]>,
        publicClient.getBlock({ blockTag: "latest" }),
        publicClient.getBlock({ blockNumber: deployedAtBlock }),
      ]);

      // Anchor to the wallet's own first observation, not the deployment block — the same fix
      // applied to the activity page and the proof view's transcript, for the same reason: a free
      // tier RPC's eth_getLogs range cap otherwise turns "scan the whole history" into a rejected
      // call that a careless catch would render as "nothing happened."
      const estimatedFrom = estimateBlockForTimestamp(
        firstObservation[0],
        { block: deployedAtBlock, timestamp: deployedBlock.timestamp },
        { block: latestBlock.number, timestamp: latestBlock.timestamp },
      );
      const fromBlock =
        estimatedFrom - 300n > deployedAtBlock ? estimatedFrom - 300n : deployedAtBlock;

      const logs = await fetchLogsInWindows(
        publicClient,
        pool,
        EVENTS.map((event) => event.item),
        fromBlock,
        latestBlock.number,
        200,
      );

      const byName = new Map<string, string>(EVENTS.map((event) => [event.item.name, event.label]));
      const rows: ActivityPreviewRow[] = [];
      for (const log of logs) {
        const decoded = log as unknown as {
          eventName?: string;
          args?: { participant?: `0x${string}` };
          transactionHash: `0x${string}`;
          blockNumber: bigint;
        };
        if (!decoded.eventName) continue;
        if (decoded.args?.participant?.toLowerCase() !== address.toLowerCase()) continue;
        const label = byName.get(decoded.eventName);
        if (!label) continue;
        rows.push({ label, txHash: decoded.transactionHash, blockNumber: decoded.blockNumber });
      }

      return rows.sort((a, b) => (a.blockNumber < b.blockNumber ? 1 : -1)).slice(0, limit);
    },
  });

  return { rows: data ?? null, isLoading, isError };
}
