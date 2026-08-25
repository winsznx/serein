"use client";

import { explorerTx } from "@/lib/chain";
import type { TxPhase } from "@/lib/hooks/use-tx-flow";
import { cn } from "@/components/ui";

/**
 * The running commentary on a transaction.
 *
 * Announced to assistive technology as it changes, because a sighted user watching a button change
 * label gets feedback that a screen-reader user otherwise would not. `aria-live="polite"` rather
 * than `assertive`: this is progress, not an emergency.
 */
export function TxStatus({ phase, className }: { phase: TxPhase; className?: string }) {
  const content = describe(phase);
  if (!content) return <div className={className} aria-live="polite" role="status" />;

  return (
    <div
      className={cn("rounded-card border px-4 py-3", content.className, className)}
      role="status"
      aria-live="polite"
    >
      <p className="text-small font-medium">{content.title}</p>
      {content.detail ? <p className="mt-1 text-caption opacity-80">{content.detail}</p> : null}
      {content.hash ? (
        <a
          href={explorerTx(content.hash)}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-block text-caption underline underline-offset-4 opacity-90 hover:opacity-100"
        >
          View on Etherscan
        </a>
      ) : null}
    </div>
  );
}

function describe(phase: TxPhase): {
  title: string;
  detail?: string;
  hash?: `0x${string}`;
  className: string;
} | null {
  const neutral = "border-white/12 bg-white/[0.04] text-white";
  const accent = "border-violet/40 bg-violet/10 text-white";

  switch (phase.status) {
    case "idle":
      return null;
    case "encrypting":
      return {
        title: "Encrypting your amount",
        detail: "This happens in your browser. The plaintext amount is never sent anywhere.",
        className: accent,
      };
    case "awaiting-signature":
      return {
        title: "Waiting for your wallet",
        detail: "Approve the transaction to continue. Nothing is sent until you do.",
        className: accent,
      };
    case "submitting":
      return {
        title: "Sending transaction",
        className: neutral,
        ...(phase.hash ? { hash: phase.hash } : {}),
      };
    case "pending":
      return {
        title: "Confirming on Sepolia",
        detail: "Usually a few seconds.",
        hash: phase.hash,
        className: neutral,
      };
    case "confirmed":
      return { title: "Done", hash: phase.hash, className: neutral };
    case "rejected":
      return {
        title: "You declined the transaction",
        detail: "Nothing was sent. You can try again whenever you like.",
        className: neutral,
      };
    case "failed":
      return {
        title: phase.message,
        detail: phase.recovery,
        className: neutral,
        ...(phase.hash ? { hash: phase.hash } : {}),
      };
  }
}
