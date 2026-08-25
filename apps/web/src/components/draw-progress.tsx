"use client";

import { useEffect, useState } from "react";

import { cn, StatusPill } from "@/components/ui";
import { formatCountdown } from "@/lib/format";
import {
  DRAW_PROGRESS_STEPS,
  DRAW_STATUS,
  DrawStatus,
  progressIndex,
  type DrawView,
} from "@serein/protocol-sdk";

/**
 * Where a draw has got to.
 *
 * A draw crosses several asynchronous boundaries, and from the outside those look like nothing
 * happening. Naming each one — and saying why it takes a step — turns a stall into a state. It also
 * means a saver who arrives mid-draw can see that the protocol is working rather than stuck.
 */
export function DrawProgress({ draw, compact }: { draw: DrawView; compact?: boolean }) {
  const current = progressIndex(draw.status);

  return (
    <div className="space-y-4">
      <ol className="flex items-center gap-1.5" aria-label="Draw progress">
        {DRAW_PROGRESS_STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step} className="flex-1">
              <div
                className={cn(
                  "h-1 rounded-pill transition-colors",
                  done ? "bg-violet" : active ? "bg-violet/60" : "bg-white/12",
                )}
              />
              {!compact ? (
                <p
                  className={cn(
                    "mt-2 hidden text-caption sm:block",
                    active ? "text-white" : done ? "text-white/60" : "text-white/35",
                  )}
                >
                  {DRAW_STATUS[step].consumer}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="text-small text-white/65">{DRAW_STATUS[draw.status].explanation}</p>

      {draw.status === DrawStatus.Selecting ? (
        <p className="tabular text-caption text-white/50">
          {draw.selectionCursor} of {draw.participantCount} participants walked
        </p>
      ) : null}

      {draw.randomAttempts > 1 ? (
        <p className="text-caption text-white/50">
          {draw.randomAttempts} random candidates drawn — earlier ones landed outside the usable
          range and were discarded. This is the rejection step working as designed, not a retry
          after a failure.
        </p>
      ) : null}
    </div>
  );
}

/** Live countdown to the draw's scheduled end. */
export function DrawCountdown({ endTimestamp }: { endTimestamp: bigint }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = Number(endTimestamp) - now;
  return (
    <span className="tabular" suppressHydrationWarning>
      {formatCountdown(remaining)}
    </span>
  );
}

export function DrawStatusPill({ status }: { status: DrawStatus }) {
  const presentation = DRAW_STATUS[status];
  const state =
    status === DrawStatus.Finalized
      ? "verified"
      : status === DrawStatus.Open
        ? "public"
        : "pending";
  return <StatusPill state={state}>{presentation.consumer}</StatusPill>;
}
