import { deployment, explorerAddress } from "@/lib/chain";

/**
 * Deterministic identity for the two tokens Serein's flows move between.
 *
 * Everything here comes from the deployment manifest — never a third-party token list, never a CDN
 * icon fetch. On the canonical deployment the manifest already records which contract is which (see
 * `deploy-canonical.ts`'s `contractName` field); this module is just the frontend's typed view of
 * that same fact, plus the local artwork and explorer link each token needs wherever its identity is
 * shown.
 */
export interface TokenMetadata {
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  icon: string;
  explorerUrl: string;
  privacy: "public" | "confidential";
  source: "zama-registry" | "serein-fixture";
}

/**
 * Zama's Confidential Token Wrappers Registry on Sepolia — the same address `deploy-canonical.ts`
 * resolved the canonical pair through. Reading it here is read-only and additive: it only ever
 * confirms or flags a concern about a pair the manifest has already committed to, never substitutes
 * for the manifest as the source of deployment identity.
 */
export const ZAMA_REGISTRY_ADDRESS: `0x${string}` = "0x2f0750Bbb0A246059d80e94c454586a7F27a128e";

export function publicTokenMetadata(): TokenMetadata {
  const state = deployment();
  const address = state.addresses?.underlyingToken ?? "0x0000000000000000000000000000000000000000";
  const canonical = state.isZamaCanonical;
  return {
    address,
    name: canonical ? "Zama Sepolia USDC mock" : "Serein test USDC",
    symbol: canonical ? "USDCMock" : "tUSDC",
    decimals: 6,
    icon: "/tokens/usdcmock.svg",
    explorerUrl: explorerAddress(address),
    privacy: "public",
    source: canonical ? "zama-registry" : "serein-fixture",
  };
}

export function confidentialTokenMetadata(): TokenMetadata {
  const state = deployment();
  const address =
    state.addresses?.confidentialToken ?? "0x0000000000000000000000000000000000000000";
  const canonical = state.isZamaCanonical;
  return {
    address,
    name: canonical ? "Zama registered cUSDCMock" : "Serein confidential USDC",
    symbol: canonical ? "cUSDCMock" : "ptUSDC",
    decimals: 6,
    icon: "/tokens/cusdcmock.svg",
    explorerUrl: explorerAddress(address),
    privacy: "confidential",
    source: canonical ? "zama-registry" : "serein-fixture",
  };
}

export const TOKEN_FALLBACK_ICON = "/tokens/token-fallback.svg";
