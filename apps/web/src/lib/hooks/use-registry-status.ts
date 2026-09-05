"use client";

import { useReadContract } from "wagmi";

import { CHAIN_ID, deployment } from "@/lib/chain";
import { publicTokenMetadata, ZAMA_REGISTRY_ADDRESS } from "@/lib/token-metadata";

/**
 * Live confirmation that the canonical pair is still what Zama's registry says it is.
 *
 * `deploy-canonical.ts` already checked this once, at deploy time, and refused to deploy if it
 * didn't hold — this hook re-checks it periodically at runtime, because a registry entry can be
 * revoked after deployment and a saver looking at the app right now deserves to know if that ever
 * happens, not just whoever last ran the deploy script.
 *
 * Unavailable and invalid are different findings and must never be collapsed into one "not verified"
 * state: an RPC hiccup says nothing about the pair's real status, while `isValid=false` or a mismatch
 * is a genuine safety finding worth surfacing.
 */
export type RegistryStatus =
  | { state: "checking" }
  | { state: "confirmed" }
  | { state: "unavailable" }
  | { state: "mismatch"; resolvedWrapper: `0x${string}` }
  | { state: "revoked" }
  | { state: "not-canonical" };

const REGISTRY_ABI = [
  {
    type: "function",
    name: "getConfidentialTokenAddress",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "isValid", type: "bool" },
      { name: "confidentialToken", type: "address" },
    ],
  },
] as const;

export function useRegistryStatus(): RegistryStatus {
  const state = deployment();
  const publicToken = publicTokenMetadata();

  const { data, isLoading, isError } = useReadContract({
    address: ZAMA_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "getConfidentialTokenAddress",
    args: [publicToken.address],
    chainId: CHAIN_ID,
    query: {
      enabled: state.ready && state.isZamaCanonical,
      staleTime: 60_000,
      refetchInterval: 60_000,
    },
  });

  if (!state.isZamaCanonical) return { state: "not-canonical" };
  if (isLoading) return { state: "checking" };
  if (isError || !data) return { state: "unavailable" };

  const [isValid, resolvedWrapper] = data;
  const expected = state.addresses?.confidentialToken.toLowerCase();
  const resolved = resolvedWrapper.toLowerCase();

  if (resolved !== expected) {
    // A nonzero address that isn't ours is the interesting case; the registry's own zero-address
    // convention for "never registered" would be identical to a mismatch here, which is fine — an
    // already-deployed canonical instance whose pair the registry no longer recognizes deserves the
    // same visible warning either way.
    return { state: "mismatch", resolvedWrapper };
  }
  if (!isValid) return { state: "revoked" };
  return { state: "confirmed" };
}
