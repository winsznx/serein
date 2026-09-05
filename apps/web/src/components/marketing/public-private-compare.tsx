"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui";

import { EncryptedValue } from "./encrypted-value";
import { usePrefersReducedMotion } from "./use-client-only";

/**
 * The landing's first scroll-linked centerpiece: public values conceal into encrypted ones as the
 * section crosses the middle of the viewport.
 *
 * The conceal is a real DOM swap, not a CSS blur left technically selectable underneath it — the
 * spec is explicit that a blur-and-hide-visually gimmick doesn't count as showing what's actually
 * private. A decorative violet veil sweeps across at the same moment, but the veil is aria-hidden and
 * carries none of the meaning; the text swap does that. Below `md`, there's no scroll geometry worth
 * tracking — a segmented toggle does the same job on tap.
 */

const METRICS = [
  { label: "USDC saved", publicValue: "12,530.21", privateValue: null },
  { label: "Share of pool", publicValue: "3.72%", privateValue: "Private" },
  { label: "Odds this draw", publicValue: "1 in 27", privateValue: "Private" },
  { label: "History", publicValue: "+4,000.00 last week", privateValue: "Private" },
];

/** True once the section has crossed ~45% up the viewport — a one-time latch, not a scrubber. */
function useCrossedMidpoint(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [crossed, setCrossed] = useState(false);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || reduceMotion) return;

    let frame = 0;
    const check = (): void => {
      const rect = node.getBoundingClientRect();
      const progress = 1 - rect.top / window.innerHeight;
      if (progress > 0.45) setCrossed(true);
    };

    const onScroll = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            check();
            window.addEventListener("scroll", onScroll, { passive: true });
          } else {
            window.removeEventListener("scroll", onScroll);
          }
        }
      },
      { threshold: 0 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [reduceMotion]);

  return [ref, reduceMotion || crossed];
}

function MetricRow({
  label,
  publicValue,
  privateValue,
  revealed,
}: {
  label: string;
  publicValue: string;
  privateValue: string | null;
  revealed: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-small">
      <span className="text-iron">{label}</span>
      {revealed ? (
        <span className="tabular font-medium text-violet">
          {privateValue ?? <EncryptedValue />}
        </span>
      ) : (
        <span className="tabular font-medium">{publicValue}</span>
      )}
    </div>
  );
}

export function PublicPrivateCompare() {
  const [sectionRef, revealed] = useCrossedMidpoint();
  const [mobileView, setMobileView] = useState<"public" | "serein">("public");

  return (
    <div ref={sectionRef} className="relative">
      {/* Mobile: a segmented toggle, no scroll dependency. */}
      <div className="mb-5 flex justify-center md:hidden">
        <div className="inline-flex rounded-pill border border-ash/60 bg-paper p-1">
          {(["public", "serein"] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setMobileView(view)}
              aria-pressed={mobileView === view}
              className={cn(
                "min-h-10 rounded-pill px-5 text-small font-medium transition-colors",
                mobileView === view ? "bg-midnight text-white" : "text-iron",
              )}
            >
              {view === "public" ? "Public pool" : "Serein"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div
          className={cn(
            "rounded-feature border border-ash/60 bg-paper p-7",
            mobileView !== "public" && "hidden md:block",
          )}
        >
          <p className="text-caption font-medium uppercase tracking-[0.14em] text-iron">
            A public prize pool
          </p>
          <div className="mt-5 space-y-3 border-t border-ash/40 pt-4">
            {METRICS.map((metric) => (
              <MetricRow
                key={metric.label}
                label={metric.label}
                publicValue={metric.publicValue}
                privateValue={metric.privateValue}
                revealed={false}
              />
            ))}
          </div>
          <p className="mt-6 text-caption text-iron">
            Anyone can read all of this, for any address, at any time.
          </p>
        </div>

        <div
          className={cn(
            "relative overflow-hidden rounded-feature bg-midnight p-7 text-white",
            mobileView !== "serein" && "hidden md:block",
          )}
        >
          {/* Decorative veil sweeping across as this column conceals. Carries no information of its
              own — the label/value swap below it is what a screen reader and a reduced-motion reader
              both see, immediately, with or without this playing. */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-y-0 left-1/2 w-1/2 -translate-x-1/2 bg-linear-to-r from-transparent via-violet/30 to-transparent blur-2xl transition-transform duration-1000 ease-out",
              revealed ? "translate-x-[260%]" : "translate-x-[-260%]",
            )}
          />
          <p className="relative text-caption font-medium uppercase tracking-[0.14em] text-violet">
            Serein
          </p>
          <div className="relative mt-5 space-y-3 border-t border-white/10 pt-4">
            {METRICS.map((metric) => (
              <div
                key={metric.label}
                className="flex items-baseline justify-between gap-4 text-small"
              >
                <span className="text-white/55">{metric.label}</span>
                <span className="tabular font-medium">
                  {revealed ? (
                    <span className="text-violet">{metric.privateValue ?? <EncryptedValue />}</span>
                  ) : (
                    metric.publicValue
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="relative mt-6 text-caption text-white/45">
            {revealed
              ? "Every number above is what a visitor to this page can actually see."
              : "Watch this column as it scrolls into place."}
          </p>
        </div>
      </div>

      <p className="mt-6 text-center text-small text-iron md:text-left">
        Your address and the fact you saved are public. The amounts are not.
      </p>
    </div>
  );
}
