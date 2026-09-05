"use client";

import { useEffect, useRef, useState } from "react";

import { Reveal } from "./reveal";
import { usePrefersReducedMotion } from "./use-client-only";

/**
 * The product-intelligence moment: a last-second deposit doesn't earn the same weight as capital
 * that stayed. Two illustrative savers, drawn as bars that grow in on scroll and then fold into
 * encrypted weight labels — never real user data, always labeled as an example.
 */

const SAVERS = [
  { name: "Alice", amount: "1,000", widthPercent: 92, weight: "Larger" },
  { name: "Bob", amount: "1,000", widthPercent: 34, weight: "Smaller" },
];

export function TwabTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const [computed, setComputed] = useState(false);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || reduceMotion) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            timeout = setTimeout(() => setComputed(true), 900);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [reduceMotion]);

  const shown = reduceMotion || computed;

  return (
    <div ref={ref} className="mx-auto max-w-2xl">
      <p className="mb-6 text-center text-caption text-iron">Example draw — illustrative values</p>
      <div className="space-y-5">
        {SAVERS.map((saver, index) => (
          <Reveal key={saver.name} delay={index * 120}>
            <div className="flex items-center gap-4">
              <span className="w-12 shrink-0 text-small text-iron">{saver.name}</span>
              <div className="h-8 flex-1 overflow-hidden rounded-badge bg-bone">
                <div
                  className="h-full rounded-badge bg-violet/70 transition-[width] duration-700 ease-out"
                  style={{ width: `${saver.widthPercent}%` }}
                />
              </div>
              <span className="tabular w-16 shrink-0 text-right text-small text-iron">
                {saver.amount}
              </span>
            </div>
          </Reveal>
        ))}
      </div>

      <div
        className="mt-6 grid grid-cols-2 gap-4 transition-opacity duration-500"
        style={{ opacity: shown ? 1 : 0 }}
        aria-hidden={!shown}
      >
        {SAVERS.map((saver) => (
          <div
            key={saver.name}
            className="rounded-card border border-ash/50 bg-paper px-4 py-3 text-center"
          >
            <p className="text-caption text-iron">{saver.name}&apos;s draw weight</p>
            <p className="mt-1 text-small font-medium text-violet">
              {saver.weight} · <span className="text-midnight">encrypted</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
