"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui";

import { usePrefersReducedMotion } from "./use-client-only";

/**
 * The landing's second scroll-linked centerpiece: a draw resolving, one row at a time, as the reader
 * scrolls through a tall section. This is a narrative visualization of the mechanism — not a claim
 * that draw #42 is real. Every row is labeled with what it demonstrates, and a separate CTA links out
 * to `/proof`, where the numbers are genuinely live.
 */

const ROWS = [
  { label: "Individual balances", value: "Encrypted", state: "encrypted" as const, at: 0 },
  { label: "Individual draw weights", value: "Encrypted", state: "encrypted" as const, at: 0 },
  { label: "Aggregate draw weight", value: "Verified", state: "verified" as const, at: 0.2 },
  { label: "Random candidate", value: "Encrypted", state: "encrypted" as const, at: 0.4 },
  { label: "Candidate accepted", value: "Verified", state: "verified" as const, at: 0.55 },
  { label: "Prefix equals aggregate", value: "Verified", state: "verified" as const, at: 0.7 },
  { label: "Winner", value: "Encrypted", state: "encrypted" as const, at: 0.85 },
  { label: "Prize", value: "Encrypted", state: "encrypted" as const, at: 0.85 },
  { label: "Principal spent on prizes", value: "0", state: "neutral" as const, at: 1 },
];

const CHIP: Record<string, string> = {
  encrypted: "bg-violet/15 text-violet",
  verified: "bg-white/10 text-white",
  neutral: "bg-white/[0.06] text-white/70",
};

function useSectionProgress(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || reduceMotion) return;

    let frame = 0;
    const compute = (): void => {
      const rect = node.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) {
        setProgress(1);
        return;
      }
      const value = -rect.top / total;
      setProgress(Math.min(1, Math.max(0, value)));
    };

    const onScroll = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(compute);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            compute();
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

  return [ref, reduceMotion ? 1 : progress];
}

export function FairnessTranscript() {
  const [ref, progress] = useSectionProgress();

  return (
    <div ref={ref} className="lg:h-[150vh]">
      <div className="lg:sticky lg:top-24">
        <div className="rounded-feature border border-white/10 bg-abyss p-6 sm:p-7">
          <div className="flex items-center justify-between">
            <p className="text-small text-white/55">How a Serein draw resolves</p>
            <span className="rounded-badge bg-white/10 px-2 py-0.5 text-caption font-medium text-white">
              {progress >= 1 ? "Finalized" : "Resolving"}
            </span>
          </div>
          <dl className="mt-5">
            {ROWS.map((row) => {
              const active = progress >= row.at;
              return (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 border-b border-white/10 py-3 transition-opacity duration-300 last:border-b-0"
                  style={{ opacity: active ? 1 : 0.35 }}
                >
                  <dt className="text-small text-white/60">{row.label}</dt>
                  <dd>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-badge px-2 py-0.5 text-caption font-medium",
                        active ? CHIP[row.state] : "bg-white/[0.04] text-white/40",
                      )}
                    >
                      {active ? row.value : "Pending"}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </div>
  );
}
