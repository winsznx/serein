import { Eyebrow } from "@/components/ui";

/**
 * The system, drawn as the two financial domains it actually is — not two equal cards implying two
 * equally-weighted ideas. Principal only ever moves between a saver and the pool; the prize reserve
 * only ever pays a winner. There is no line connecting them, and the diagram says so explicitly
 * rather than relying on the reader to infer it from the absence of an arrow.
 */
export function PrincipalPrizeDiagram() {
  return (
    <div className="rounded-feature border border-white/10 bg-abyss p-6 sm:p-10">
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <div className="flex flex-col items-center text-center">
          <Eyebrow>Your money</Eyebrow>
          <div className="mt-4 w-full max-w-xs space-y-3">
            <div className="rounded-card border border-white/15 px-4 py-3 text-small text-white/70">
              Your wallet
            </div>
            <div className="text-caption text-white/40">↓ confidential transfer</div>
            <div className="rounded-feature border border-violet/40 bg-violet/10 px-4 py-4 text-small font-medium text-white">
              Principal pool
              <p className="mt-1 text-caption font-normal text-white/55">
                Encrypted saver balances
              </p>
            </div>
            <div className="text-caption text-white/40">↓ withdraw only</div>
            <div className="rounded-card border border-white/15 px-4 py-3 text-small text-white/70">
              Your wallet
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center text-center">
          <Eyebrow>Prize money</Eyebrow>
          <div className="mt-4 w-full max-w-xs space-y-3">
            <div className="rounded-card border border-white/15 px-4 py-3 text-small text-white/70">
              Prize source
            </div>
            <div className="text-caption text-white/40">↓ operator funded</div>
            <div className="rounded-feature border border-white/15 bg-white/[0.04] px-4 py-4 text-small font-medium text-white">
              Prize reserve
              <p className="mt-1 text-caption font-normal text-white/55">Holds no principal</p>
            </div>
            <div className="text-caption text-white/40">↓ pays at most one winner</div>
            <div className="rounded-card border border-white/15 px-4 py-3 text-small text-white/70">
              Winner&apos;s wallet
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-center gap-3">
        <span className="h-px flex-1 max-w-24 bg-white/15" />
        <span className="rounded-badge border border-white/20 px-3 py-1.5 text-caption font-medium tracking-[0.08em] text-white/70">
          No spend path between them
        </span>
        <span className="h-px flex-1 max-w-24 bg-white/15" />
      </div>
    </div>
  );
}
