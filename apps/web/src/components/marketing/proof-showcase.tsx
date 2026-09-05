import { ButtonLink, StatusPill } from "@/components/ui";

/**
 * The landing's proof crescendo: a browser-window composition of the real proof view's structure.
 *
 * No transaction hash or draw number is invented here — every value a judge would want to verify
 * lives at `/proof`, live, and this section says so rather than performing a fake live number. What's
 * shown is the shape of what that page always contains, which is real regardless of which draw is
 * currently open.
 */

const LEFT_ROWS = [
  {
    label: "Draw state",
    value: "Open · Closing · Selecting · Finalized",
    state: "public" as const,
  },
  { label: "Participants", value: "Public count", state: "public" as const },
  { label: "Aggregate draw weight", value: "Verified after close", state: "verified" as const },
  {
    label: "Randomness status",
    value: "Accepted / rejected, encrypted candidate",
    state: "encrypted" as const,
  },
  { label: "Selection progress", value: "Cursor, publicly auditable", state: "public" as const },
  { label: "Principal invariant", value: "Spent on prizes: 0", state: "verified" as const },
];

const EVIDENCE = [
  "Pool contract",
  "Prize reserve",
  "Draw transaction",
  "Aggregate proof transaction",
  "Finalization transaction",
  "Source verified on Sourcify",
];

export function ProofShowcase() {
  return (
    <div className="overflow-hidden rounded-feature border border-white/10 bg-abyss">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </span>
        <p className="ml-2 text-caption text-white/50">Serein / Proof / Sepolia</p>
      </div>

      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.7fr_1fr]">
        <div className="rounded-card border border-white/10 bg-midnight p-5">
          <p className="text-small text-white/55">A draw, at any point in its lifecycle</p>
          <dl className="mt-4">
            {LEFT_ROWS.map((row) => (
              <div
                key={row.label}
                className="flex flex-col gap-1.5 border-b border-white/10 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <dt className="text-small text-white/60">{row.label}</dt>
                <dd className="flex items-center gap-2">
                  <StatusPill state={row.state}>{row.value}</StatusPill>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-small text-white/55">Evidence rail</p>
          <ul className="space-y-2">
            {EVIDENCE.map((item) => (
              <li
                key={item}
                className="rounded-badge border border-white/10 bg-white/[0.03] px-3 py-2.5 text-small text-white/70"
              >
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-caption text-white/40">
            Every row here is a real link on the live proof page — nothing on this preview is a
            stand-in transaction.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-white/10 p-5 sm:flex-row sm:p-7">
        <ButtonLink href="/proof" tone="violet" fullWidth className="sm:w-auto">
          Inspect a live draw
        </ButtonLink>
        <ButtonLink href="/docs/contracts" tone="ghost-dark" fullWidth className="sm:w-auto">
          View contracts
        </ButtonLink>
        <ButtonLink href="/docs/security" tone="ghost-dark" fullWidth className="sm:w-auto">
          Read evidence
        </ButtonLink>
      </div>
    </div>
  );
}
