"use client";

import { useId, useState, type ReactNode } from "react";

import { Button, cn } from "@/components/ui";
import { CIPHERTEXT_MASK } from "@/lib/format";

/**
 * How Serein shows something it cannot read.
 *
 * The rule this component exists to enforce: an undisclosed value is never rendered as a number.
 * Showing `0.00` for a balance the app has not decrypted would be a lie that looks authoritative,
 * and the saver reading it has no way to tell the difference. So it renders as dots, with a screen
 * reader announcement that says what is actually true — the value is encrypted and can be revealed.
 *
 * Revealing is a local act. The plaintext appears in this tab, is held in memory, and goes nowhere
 * else. The copy under the button says so, because "sign this message" with no explanation is how
 * people learn to sign things without reading them.
 */

export type RevealState =
  | { status: "hidden" }
  | { status: "revealing" }
  | { status: "revealed"; value: bigint }
  | { status: "error"; message: string };

export function PrivateValue({
  state,
  onReveal,
  render,
  size = "display",
  label,
  disabled,
  revealLabel = "Reveal",
}: {
  state: RevealState;
  onReveal: () => void;
  render: (value: bigint) => ReactNode;
  size?: "display" | "heading" | "body";
  label: string;
  disabled?: boolean;
  revealLabel?: string;
}) {
  const describedBy = useId();

  const sizes = {
    display: "text-heading-lg md:text-display",
    heading: "text-heading",
    body: "text-subheading",
  } as const;

  if (state.status === "revealed") {
    return (
      <div className="space-y-2">
        <p className={cn("reveal-in tabular font-medium", sizes[size])}>{render(state.value)}</p>
        <p className="text-caption text-white/50">
          Revealed in this browser only. It is not stored or sent anywhere.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className={cn("ciphertext font-medium", sizes[size])} aria-describedby={describedBy}>
        <span aria-hidden="true">{CIPHERTEXT_MASK}</span>
        <span className="sr-only">
          {label} is encrypted. Choose reveal to decrypt it privately.
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          tone="outline-violet"
          onClick={onReveal}
          disabled={disabled || state.status === "revealing"}
          aria-describedby={describedBy}
        >
          {state.status === "revealing" ? "Waiting for your signature…" : revealLabel}
        </Button>
        {state.status === "error" ? (
          <p role="alert" className="text-small text-white">
            {state.message}
          </p>
        ) : null}
      </div>

      <p id={describedBy} className="text-caption text-white/50">
        Revealing asks your wallet to sign a read authorisation. It does not move funds.
      </p>
    </div>
  );
}

/** Inline masked value for tables and rows, where a full reveal control would be too heavy. */
export function PrivateInline({ label }: { label: string }) {
  return (
    <span className="ciphertext text-small">
      <span aria-hidden="true">{CIPHERTEXT_MASK}</span>
      <span className="sr-only">{label} is encrypted</span>
    </span>
  );
}

/** Hook that manages a single reveal's lifecycle, including the "you declined" case. */
export function useRevealState(): [
  RevealState,
  (run: () => Promise<bigint>) => Promise<void>,
  () => void,
] {
  const [state, setState] = useState<RevealState>({ status: "hidden" });

  const reveal = async (run: () => Promise<bigint>): Promise<void> => {
    setState({ status: "revealing" });
    try {
      const value = await run();
      setState({ status: "revealed", value });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not reveal that value.",
      });
    }
  };

  const reset = (): void => setState({ status: "hidden" });

  return [state, reveal, reset];
}
