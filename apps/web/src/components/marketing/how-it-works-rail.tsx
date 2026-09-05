"use client";

import { cn } from "@/components/ui";

import { Reveal } from "./reveal";

/**
 * Three steps, each with a small purpose-built diagram instead of a stock icon.
 *
 * A horizontal rail on desktop, a vertical one on mobile — same three cards, same connective line,
 * just re-laid-out by the grid rather than swapped for a different component.
 */

function BoundaryDiagram() {
  return (
    <svg viewBox="0 0 220 84" className="h-20 w-full" role="presentation" aria-hidden="true">
      <rect x="4" y="30" width="70" height="24" rx="12" fill="var(--color-bone)" />
      <text
        x="39"
        y="46"
        textAnchor="middle"
        fontSize="11"
        fill="var(--color-iron)"
        fontFamily="var(--font-sans)"
      >
        tUSDC
      </text>
      <line
        x1="110"
        y1="10"
        x2="110"
        y2="74"
        stroke="var(--color-ash)"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      <path
        d="M80 42 h100"
        stroke="var(--color-violet)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        markerEnd="url(#arrow)"
      />
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" fill="var(--color-violet)" />
        </marker>
      </defs>
      <rect x="146" y="28" width="70" height="28" rx="14" fill="var(--color-midnight)" />
      <text
        x="181"
        y="46"
        textAnchor="middle"
        fontSize="10"
        letterSpacing="2"
        fill="var(--color-violet)"
        fontFamily="var(--font-sans)"
      >
        ●●●●●●
      </text>
    </svg>
  );
}

function EncryptDiagram() {
  return (
    <svg viewBox="0 0 220 84" className="h-20 w-full" role="presentation" aria-hidden="true">
      <rect
        x="4"
        y="30"
        width="90"
        height="24"
        rx="12"
        fill="var(--color-paper)"
        stroke="var(--color-ash)"
      />
      <text
        x="49"
        y="46"
        textAnchor="middle"
        fontSize="11"
        fill="var(--color-midnight)"
        fontFamily="var(--font-sans)"
      >
        250.00
      </text>
      <path
        d="M100 42 h96"
        stroke="var(--color-violet)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        markerEnd="url(#arrow2)"
      />
      <defs>
        <marker id="arrow2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" fill="var(--color-violet)" />
        </marker>
      </defs>
      <rect x="150" y="16" width="66" height="52" rx="16" fill="var(--color-midnight)" />
      <text
        x="183"
        y="46"
        textAnchor="middle"
        fontSize="14"
        letterSpacing="2"
        fill="var(--color-violet)"
        fontFamily="var(--font-sans)"
      >
        ●●●
      </text>
    </svg>
  );
}

function TwabDiagram() {
  const bars = [
    { x: 8, width: 60, height: 12, y: 26 },
    { x: 8, width: 40, height: 12, y: 44 },
    { x: 8, width: 24, height: 12, y: 62 },
  ];
  return (
    <svg viewBox="0 0 220 84" className="h-20 w-full" role="presentation" aria-hidden="true">
      {bars.map((bar, index) => (
        <rect
          key={index}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          rx="6"
          fill="var(--color-ash)"
          opacity={0.7 - index * 0.15}
        />
      ))}
      <line x1="4" y1="12" x2="4" y2="76" stroke="var(--color-ash)" strokeWidth="1" />
      <path
        d="M120 40 h96"
        stroke="var(--color-violet)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        markerEnd="url(#arrow3)"
      />
      <defs>
        <marker id="arrow3" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" fill="var(--color-violet)" />
        </marker>
      </defs>
      <rect
        x="150"
        y="30"
        width="66"
        height="24"
        rx="12"
        fill="var(--color-violet)"
        opacity="0.15"
      />
      <text
        x="183"
        y="46"
        textAnchor="middle"
        fontSize="9"
        fill="var(--color-violet)"
        fontFamily="var(--font-sans)"
      >
        Weighted
      </text>
    </svg>
  );
}

const STEPS = [
  {
    step: "01",
    title: "Make test USDC private",
    body: "Claim test USDC, then wrap it into its confidential form. The wrap crosses the transparent boundary, so Serein says that plainly.",
    diagram: BoundaryDiagram,
  },
  {
    step: "02",
    title: "Add private savings",
    body: "Your amount is encrypted in the browser before the pool receives it. The contract computes on it without ever reading it.",
    diagram: EncryptDiagram,
  },
  {
    step: "03",
    title: "Enter exact private draws",
    body: "Your chance is based on how much you saved and how long you kept it there. Weight, odds, winner and prize all stay encrypted.",
    diagram: TwabDiagram,
  },
];

export function HowItWorksRail() {
  return (
    <ol className="grid gap-5 md:grid-cols-3">
      {STEPS.map((item, index) => {
        const Diagram = item.diagram;
        return (
          <li key={item.step}>
            <Reveal delay={index * 90} className="h-full">
              <div
                className={cn(
                  "flex h-full flex-col gap-4 rounded-feature border border-ash/50 bg-paper p-6",
                )}
              >
                <Diagram />
                <div>
                  <p className="tabular text-caption font-medium text-violet">{item.step}</p>
                  <h3 className="mt-2 text-subheading">{item.title}</h3>
                  <p className="mt-2 text-small text-iron">{item.body}</p>
                </div>
              </div>
            </Reveal>
          </li>
        );
      })}
    </ol>
  );
}
