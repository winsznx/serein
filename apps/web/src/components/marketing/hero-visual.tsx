"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui";

/**
 * The hero's visual stage: an original sealed savings capsule, the real savings card behind it, and
 * a small proof slip in front — three surfaces, one composition, all built from Serein's own tokens
 * rather than a stock illustration or a second accent color.
 *
 * Everything here is inline SVG/CSS. No raster asset pipeline, no image weight above the fold, and no
 * risk of the "capsule" reading as a coin, a padlock, or a chain link — the three clichés the refactor
 * spec explicitly rules out.
 */

function SealedCapsule({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 300"
      className={cn("h-full w-full", className)}
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="capsule-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-paper)" />
          <stop offset="100%" stopColor="var(--color-bone)" />
        </linearGradient>
        <linearGradient id="capsule-seam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-violet)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--color-violet)" stopOpacity="0.25" />
        </linearGradient>
        <radialGradient id="capsule-core" cx="50%" cy="38%" r="60%">
          <stop offset="0%" stopColor="var(--color-violet)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--color-violet)" stopOpacity="0" />
        </radialGradient>
        <filter id="capsule-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      <rect x="20" y="10" width="180" height="280" rx="60" fill="url(#capsule-core)" />
      <rect
        x="30"
        y="16"
        width="160"
        height="268"
        rx="52"
        fill="url(#capsule-body)"
        stroke="var(--color-midnight)"
        strokeOpacity="0.08"
      />
      <rect x="108" y="40" width="4" height="220" rx="2" fill="url(#capsule-seam)" />
      <rect
        x="102"
        y="40"
        width="16"
        height="220"
        rx="8"
        fill="var(--color-violet)"
        opacity="0.16"
        filter="url(#capsule-blur)"
      />

      <g className="capsule-glyphs">
        <circle cx="80" cy="120" r="3.5" fill="var(--color-violet)" opacity="0.55" />
        <circle cx="140" cy="132" r="3.5" fill="var(--color-violet)" opacity="0.4" />
        <circle cx="80" cy="160" r="3.5" fill="var(--color-violet)" opacity="0.35" />
        <circle cx="140" cy="176" r="3.5" fill="var(--color-violet)" opacity="0.5" />
      </g>

      <rect
        x="30"
        y="16"
        width="160"
        height="268"
        rx="52"
        fill="none"
        stroke="var(--color-midnight)"
        strokeOpacity="0.1"
        strokeWidth="1"
      />
    </svg>
  );
}

/** Small blurred particles drifting around the capsule. Fixed positions, gentle opacity pulse only. */
function EncryptedParticles() {
  const dots = [
    { top: "8%", left: "12%", size: 6, delay: "0s" },
    { top: "18%", left: "84%", size: 4, delay: "0.6s" },
    { top: "42%", left: "4%", size: 5, delay: "1.2s" },
    { top: "58%", left: "92%", size: 4, delay: "0.3s" },
    { top: "78%", left: "10%", size: 3, delay: "1.6s" },
    { top: "88%", left: "80%", size: 5, delay: "0.9s" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {dots.map((dot, index) => (
        <span
          key={index}
          className="absolute rounded-full bg-violet/40 blur-[1px]"
          style={{
            top: dot.top,
            left: dot.left,
            width: dot.size,
            height: dot.size,
            animation: "particle-pulse 5s ease-in-out infinite",
            animationDelay: dot.delay,
          }}
        />
      ))}
    </div>
  );
}

function ProofSlip({ className }: { className?: string }) {
  const rows = [
    { label: "Aggregate", value: "Verified" },
    { label: "Random target", value: "Encrypted" },
    { label: "Winner", value: "Encrypted" },
    { label: "Principal spent", value: "0" },
  ];
  return (
    <div
      className={cn(
        "w-56 rounded-card border border-ash/50 bg-paper p-4 shadow-[var(--shadow-float)]",
        className,
      )}
    >
      <p className="text-caption font-medium text-iron">Exact draw</p>
      <dl className="mt-2.5 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-caption">
            <dt className="text-iron">{row.label}</dt>
            <dd className={cn("font-medium", row.value === "0" ? "text-midnight" : "text-violet")}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Optional desktop-only mouse response: 2-3 degrees of perspective across the whole visual group. */
function useTilt() {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const onMove = (event: MouseEvent): void => {
      const rect = node.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      setTilt({ x: py * -3, y: px * 3 });
    };
    const onLeave = (): void => setTilt({ x: 0, y: 0 });

    node.addEventListener("mousemove", onMove);
    node.addEventListener("mouseleave", onLeave);
    return () => {
      node.removeEventListener("mousemove", onMove);
      node.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return { ref, tilt };
}

export function HeroVisual({
  productCard,
  className,
}: {
  productCard: React.ReactNode;
  className?: string;
}) {
  const { ref, tilt } = useTilt();

  return (
    <div
      ref={ref}
      className={cn("relative mx-auto aspect-[4/5] w-full max-w-md", className)}
      style={{
        perspective: "1200px",
      }}
    >
      <div
        className="relative h-full w-full transition-transform duration-300 ease-out"
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
      >
        <EncryptedParticles />

        <div className="capsule-drift absolute left-1/2 top-0 h-[70%] w-[62%] -translate-x-1/2">
          <SealedCapsule />
        </div>

        <div className="absolute bottom-[6%] left-1/2 w-[88%] max-w-sm -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0">
          {productCard}
        </div>

        <div className="proof-slip-drift absolute -left-3 top-[6%] hidden sm:block lg:-left-10">
          <ProofSlip />
        </div>
      </div>
    </div>
  );
}
