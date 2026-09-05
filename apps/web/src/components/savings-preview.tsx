import { cn } from "@/components/ui";

/**
 * The hero visual: the product itself, not an illustration of it.
 *
 * DESIGN.md is explicit that imagery is product-surface driven — real UI, no decorative 3D, no
 * glowing chain graphics. So the hero shows the savings card a user actually sees, rendered from the
 * same tokens as the live one, with the balance in its encrypted state because that is the honest
 * default. A marketing page that showed a revealed balance would be advertising the opposite of the
 * product.
 */
export function SavingsCardPreview({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-full max-w-sm rounded-feature bg-midnight p-6 text-white",
        "shadow-[rgba(0,0,0,0.05)_0px_6px_20px_0px,rgba(0,0,0,0.06)_0px_0px_0px_1px]",
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <p className="text-caption text-white/55">Your private savings</p>
        <span className="rounded-badge bg-violet/15 px-2 py-0.5 text-caption font-medium text-violet">
          ◆ Encrypted
        </span>
      </div>

      <p className="mt-3 text-heading-lg font-medium tracking-[0.16em] text-graphite">••••••</p>
      <p className="mt-1 text-caption text-white/45">Hidden until you reveal it</p>

      <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-small text-white/55">Current draw</span>
          <span className="text-small font-medium">#42</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-small text-white/55">Ends in</span>
          <span className="tabular text-small font-medium">04m 18s</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-small text-white/55">Your draw weight</span>
          <span className="text-small font-medium text-violet">Private</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-small text-white/55">Prize</span>
          <span className="text-small font-medium text-violet">Private</span>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <span className="flex min-h-11 flex-1 items-center justify-center rounded-pill bg-violet text-small font-medium text-white">
          Add savings
        </span>
        <span className="flex min-h-11 flex-1 items-center justify-center rounded-pill border border-white/25 text-small font-medium text-white">
          Withdraw
        </span>
      </div>
    </div>
  );
}

/**
 * The before/after that makes the problem concrete.
 *
 * Two cards, same person, same deposit. The left is what an ordinary onchain prize pool publishes;
 * the right is what Serein publishes. No fear language — the contrast does the work, and the numbers
 * on the left are the sort anyone can already read off a block explorer today.
 */
export function DisclosureComparison() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-card border border-ash/60 bg-paper p-6">
        <p className="text-caption font-medium uppercase tracking-[0.14em] text-iron">
          A public prize pool
        </p>
        <p className="mt-4 tabular text-heading font-medium">12,530.21</p>
        <p className="text-small text-iron">USDC saved</p>
        <dl className="mt-5 space-y-2.5 border-t border-ash/40 pt-4">
          <div className="flex justify-between text-small">
            <dt className="text-iron">Share of pool</dt>
            <dd className="tabular font-medium">3.72%</dd>
          </div>
          <div className="flex justify-between text-small">
            <dt className="text-iron">Odds this draw</dt>
            <dd className="tabular font-medium">1 in 27</dd>
          </div>
          <div className="flex justify-between text-small">
            <dt className="text-iron">Last week</dt>
            <dd className="tabular font-medium">+4,000.00</dd>
          </div>
        </dl>
        <p className="mt-5 text-caption text-iron">
          Anyone can read all of this, for any address, at any time.
        </p>
      </div>

      <div className="rounded-card bg-midnight p-6 text-white">
        <p className="text-caption font-medium uppercase tracking-[0.14em] text-violet">Serein</p>
        <p className="mt-4 text-heading font-medium tracking-[0.16em] text-graphite">••••••</p>
        <p className="text-small text-white/55">USDC saved</p>
        <dl className="mt-5 space-y-2.5 border-t border-white/10 pt-4">
          <div className="flex justify-between text-small">
            <dt className="text-white/55">Share of pool</dt>
            <dd className="font-medium text-violet">Private</dd>
          </div>
          <div className="flex justify-between text-small">
            <dt className="text-white/55">Odds this draw</dt>
            <dd className="font-medium text-violet">Private</dd>
          </div>
          <div className="flex justify-between text-small">
            <dt className="text-white/55">Last week</dt>
            <dd className="font-medium text-violet">Private</dd>
          </div>
        </dl>
        <p className="mt-5 text-caption text-white/45">
          Your address and the fact you saved are public. The amounts are not.
        </p>
      </div>
    </div>
  );
}
