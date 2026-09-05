import Image from "next/image";

import { cn } from "@/components/ui";
import { truncateAddress } from "@/lib/format";
import type { RegistryStatus } from "@/lib/hooks/use-registry-status";
import type { TokenMetadata } from "@/lib/token-metadata";

/**
 * The one place a token's identity is assembled: icon, name, address, provenance.
 *
 * Every screen that shows `USDCMock` or `cUSDCMock` uses this, so a saver sees the same identity —
 * same icon, same short address, same explorer link — whether they're minting, wrapping, or reading
 * the activity ledger. That consistency is the point: a token that looks slightly different in each
 * flow reads as untrustworthy even when the underlying data is identical.
 */
export function TokenIdentity({
  token,
  registryStatus,
  size = "md",
  showAddress = true,
  className,
}: {
  token: TokenMetadata;
  /** Only meaningful for the confidential token — the public token isn't registry-tracked. */
  registryStatus?: RegistryStatus;
  size?: "sm" | "md";
  showAddress?: boolean;
  className?: string;
}) {
  const iconSize = size === "sm" ? 24 : 32;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Image
        src={token.icon}
        alt=""
        width={iconSize}
        height={iconSize}
        className="shrink-0 rounded-full"
      />
      <div className="min-w-0">
        <p className={cn("font-medium text-white", size === "sm" ? "text-small" : "text-body")}>
          {token.symbol}
        </p>
        <p className="truncate text-caption text-white/50">
          {token.privacy === "public"
            ? token.source === "zama-registry"
              ? "Zama Sepolia mock"
              : "Testnet fixture"
            : "Confidential ERC-7984"}
          {registryStatus ? <RegistryBadge status={registryStatus} /> : null}
        </p>
        {showAddress ? (
          <a
            href={token.explorerUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-caption text-white/40 underline decoration-white/20 underline-offset-2 hover:text-white/70"
          >
            {truncateAddress(token.address)} ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

function RegistryBadge({ status }: { status: RegistryStatus }) {
  switch (status.state) {
    case "confirmed":
      return <span className="ml-1.5 text-violet">· Zama registered wrapper ✓</span>;
    case "checking":
      return <span className="ml-1.5 text-white/35">· checking registry…</span>;
    case "unavailable":
      return <span className="ml-1.5 text-white/35">· registry check unavailable</span>;
    case "revoked":
      return <span className="ml-1.5 text-white">· wrapper revoked by registry</span>;
    case "mismatch":
      return <span className="ml-1.5 text-white">· registry resolves a different wrapper</span>;
    case "not-canonical":
      return null;
  }
}
