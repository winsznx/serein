import type { Metadata } from "next";

import { SavingsCardPreview } from "@/components/savings-preview";
import { SiteFooter } from "@/components/site-chrome";
import { Badge, ButtonLink, SectionHeading } from "@/components/ui";
import { DisclosureTeaser } from "@/components/marketing/disclosure-teaser";
import { FairnessTranscript } from "@/components/marketing/fairness-transcript";
import { FinalCTA } from "@/components/marketing/final-cta";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { HowItWorksRail } from "@/components/marketing/how-it-works-rail";
import { LandingNav } from "@/components/marketing/landing-nav";
import { PrincipalPrizeDiagram } from "@/components/marketing/principal-prize-diagram";
import { ProofShowcase } from "@/components/marketing/proof-showcase";
import { PublicPrivateCompare } from "@/components/marketing/public-private-compare";
import { Reveal } from "@/components/marketing/reveal";
import { TwabTimeline } from "@/components/marketing/twab-timeline";

export const metadata: Metadata = {
  title: "Serein — Private savings. Fair prizes.",
};

/**
 * The marketing landing page.
 *
 * Rebuilt per `SEREIN_LANDING_REFACTOR.md`: a scene-based narrative (desire → problem →
 * understanding → proof → trust → conversion) instead of a repeated card grammar, with a first-class
 * hero visual, two scroll-linked centerpieces, and product imagery breaking up the text. Every claim,
 * route, and number is unchanged from the page this replaces — only the composition and motion are
 * new. Kept thin on purpose: this file composes `components/marketing/*`, it doesn't contain them.
 */
export default function LandingPage() {
  return (
    <>
      <LandingNav />

      <main id="main">
        {/* 1 — Hero. Desire before documentation. */}
        <section className="landing-canvas hero-wash">
          <div className="container-serein grid items-center gap-14 py-16 md:py-24 lg:grid-cols-12 lg:gap-8 lg:py-28">
            <div className="max-w-xl space-y-7 lg:col-span-5">
              <Reveal>
                <Badge tone="light">Sepolia testnet · Zama Protocol</Badge>
              </Reveal>

              <Reveal delay={80}>
                <h1 className="text-heading-lg font-medium sm:text-[3.25rem] sm:leading-[1.02] sm:tracking-[-0.04em] lg:text-display">
                  Private savings.
                  <br />
                  Fair prizes.
                </h1>
              </Reveal>

              <Reveal delay={160}>
                <p className="text-lead text-iron">
                  Save private test USDC into a shared prize pool. Your balance and draw weight stay
                  encrypted, your odds stay exact, and your principal stays yours.
                </p>
              </Reveal>

              <Reveal delay={240}>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <ButtonLink href="/app" tone="violet" size="lg">
                    Start saving
                  </ButtonLink>
                  <ButtonLink href="/proof" tone="ghost-light" size="lg">
                    See a live draw
                  </ButtonLink>
                </div>
              </Reveal>

              <Reveal delay={300}>
                <ButtonLink
                  href="/docs/how-it-works"
                  tone="ghost-light"
                  size="md"
                  className="border-none px-0 text-violet underline-offset-4 hover:bg-transparent hover:underline"
                >
                  Read how exact fairness works
                </ButtonLink>
              </Reveal>

              <Reveal delay={340}>
                <p className="text-caption text-iron">
                  No sign-up. Connect a wallet, claim test tokens, make them private, and try the
                  full cycle on Sepolia.
                </p>
              </Reveal>
            </div>

            <div className="lg:col-span-7">
              <Reveal delay={200} y={16}>
                <HeroVisual productCard={<SavingsCardPreview />} />
              </Reveal>
            </div>
          </div>
        </section>

        {/* 2 — The problem, taught by watching it happen. */}
        <section className="bg-paper py-20 md:py-28">
          <div className="container-serein space-y-12">
            <Reveal>
              <SectionHeading
                surface="light"
                eyebrow="What public chains expose"
                title="Saving onchain shouldn't publish your position."
                lead="In a public prize pool, your balance, share, odds and history can be read by anyone. Serein keeps the financial position encrypted while preserving a verifiable draw."
              />
            </Reveal>
            <Reveal delay={100}>
              <PublicPrivateCompare />
            </Reveal>
          </div>
        </section>

        {/* 3 — How it works, three purpose-built diagrams. */}
        <section className="bg-bone py-20 md:py-28">
          <div className="container-serein space-y-12">
            <Reveal>
              <SectionHeading
                surface="light"
                eyebrow="How it works"
                title="Three steps, then your savings do the rest."
              />
            </Reveal>
            <HowItWorksRail />
          </div>
        </section>

        {/* 4 — Scroll bridge. The missing product-intelligence moment, still on light. */}
        <section className="bg-paper py-20 md:py-28">
          <div className="container-serein space-y-12">
            <Reveal>
              <SectionHeading
                surface="light"
                align="center"
                title="A last-second deposit shouldn't count like a month of saving."
                lead="Serein measures encrypted time-weighted balances. Saving more helps. Saving longer helps. A balance arriving just before the draw doesn't receive the same weight as capital that stayed."
              />
            </Reveal>
            <Reveal delay={100}>
              <TwabTimeline />
            </Reveal>
          </div>
        </section>

        {/* 5 — The hard cut. Everything below here is the product surface, and it stays dark. */}
        <section className="bg-midnight py-20 text-white md:py-28">
          <div className="container-serein space-y-14">
            <Reveal>
              <SectionHeading
                eyebrow="Exact fairness"
                title="Fairness survives encryption."
                lead="Every participant's chance is their exact share of the pool's time-weighted savings. Serein samples that distribution without exposing the individual weights, the random target, or the winner."
                align="center"
              />
            </Reveal>

            <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
              <div className="space-y-6 lg:sticky lg:top-24">
                <Reveal>
                  <p className="text-body text-white/70">
                    Picking a winner in proportion to hidden weights needs a uniform random number
                    over the pool&apos;s total. The coprocessor only draws random numbers bounded by
                    a power of two, and a pool&apos;s total is never a power of two.
                  </p>
                </Reveal>
                <Reveal delay={80}>
                  <div className="rounded-card border border-white/10 bg-abyss p-5">
                    <p className="font-mono text-caption leading-relaxed text-white/75">
                      B = nextPowerOfTwo(T)
                      <br />r ~ Uniform[0, B)
                      <br />
                      accept iff r &lt; T<br />
                      <span className="text-violet">P(r = x | r &lt; T) = 1/T</span>
                    </p>
                  </div>
                </Reveal>
                <Reveal delay={140}>
                  <p className="text-body text-white/70">
                    Serein samples the next power of two, keeps the candidate only when it falls
                    below the verified total, and otherwise draws again. Conditioned on acceptance,
                    every point in the real range is exactly equally likely.
                  </p>
                </Reveal>
                <Reveal delay={200}>
                  <ButtonLink href="/docs/how-it-works" tone="ghost-dark">
                    Read the full argument
                  </ButtonLink>
                </Reveal>
              </div>

              <FairnessTranscript />
            </div>
          </div>
        </section>

        {/* 6 — No-loss, drawn as the structure it is. */}
        <section className="bg-abyss py-20 text-white md:py-28">
          <div className="container-serein space-y-12">
            <Reveal>
              <SectionHeading
                eyebrow="No loss by construction"
                title="Prize money has no path to your savings."
                lead="Principal and prizes live in separate financial domains. The prize reserve can pay a winner. It cannot spend the assets held as saver principal."
              />
            </Reveal>
            <Reveal delay={100}>
              <PrincipalPrizeDiagram />
            </Reveal>
            <Reveal delay={160}>
              <p className="max-w-3xl text-small text-white/50">
                Network gas still applies and is not principal. The Sepolia prize source is operator
                funded, not a claim of real yield.
              </p>
            </Reveal>
          </div>
        </section>

        {/* 7 — The wow section. Where a judge stops scrolling. */}
        <section className="bg-midnight py-20 text-white md:py-28">
          <div className="container-serein space-y-12">
            <Reveal>
              <SectionHeading
                title="Private doesn't mean invisible to verification."
                lead="Every public boundary Serein needs for fairness is exposed with a proof trail. The private financial values remain encrypted."
              />
            </Reveal>
            <Reveal delay={100}>
              <ProofShowcase />
            </Reveal>
          </div>
        </section>

        {/* 8 — Privacy disclosure, the teaser. */}
        <section className="bg-abyss py-20 text-white md:py-28">
          <div className="container-serein space-y-10">
            <Reveal>
              <SectionHeading
                eyebrow="What is public"
                title="A privacy claim you can audit."
                lead="Serein does not claim anonymity. It states exactly what the public chain can see and exactly what stays encrypted."
              />
            </Reveal>
            <Reveal delay={100}>
              <DisclosureTeaser />
            </Reveal>
          </div>
        </section>

        {/* 9 — Final CTA. */}
        <section className="bg-midnight py-24 text-white">
          <div className="container-serein">
            <Reveal>
              <FinalCTA />
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter surface="dark" />
    </>
  );
}
