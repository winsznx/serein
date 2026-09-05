import { ButtonLink } from "@/components/ui";

/**
 * The close. An oversized, barely-visible echo of the hero's sealed capsule sits behind the copy —
 * the only decoration this section needs, and quiet enough that it never competes with the CTA.
 */
export function FinalCTA() {
  return (
    <div className="relative overflow-hidden text-center">
      <svg
        viewBox="0 0 400 400"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 opacity-[0.06]"
        aria-hidden="true"
      >
        <rect
          x="120"
          y="20"
          width="160"
          height="360"
          rx="80"
          fill="none"
          stroke="var(--color-violet)"
          strokeWidth="1.5"
        />
        <line x1="200" y1="60" x2="200" y2="340" stroke="var(--color-violet)" strokeWidth="1.5" />
      </svg>

      <div className="relative mx-auto max-w-3xl space-y-7">
        <h2 className="text-heading md:text-heading-lg">
          See private savings resolve into a fair draw.
        </h2>
        <p className="text-lead text-white/65">
          Claim test USDC, make it private, add savings, and inspect the complete Sepolia cycle.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/app" tone="light" size="lg">
            Start saving
          </ButtonLink>
          <ButtonLink href="/proof" tone="ghost-dark" size="lg">
            Inspect a live draw
          </ButtonLink>
        </div>
        <a
          href="https://github.com/winsznx/serein"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-block text-small text-white/50 underline-offset-4 hover:text-white/80 hover:underline"
        >
          View source
        </a>
      </div>
    </div>
  );
}
