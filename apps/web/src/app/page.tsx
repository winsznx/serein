import type { Metadata } from "next";

import { DisclosureComparison, SavingsCardPreview } from "@/components/savings-preview";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Badge, ButtonLink, Card, Eyebrow, SectionHeading, StatusPill } from "@/components/ui";
import { LEAKAGE_LEDGER } from "@serein/protocol-sdk";

export const metadata: Metadata = {
  title: "Serein — Private savings. Fair prizes.",
};

const STAGES = [
  {
    step: "01",
    title: "Make test USDC private",
    body: "Wrap the public test token into its confidential form. This step is visible on chain — it is the boundary between the transparent world and the private one, and Serein says so rather than blurring it.",
  },
  {
    step: "02",
    title: "Save into the pool",
    body: "Your deposit amount is encrypted in your browser before it is sent. The pool adds it to an encrypted balance it can compute on but never read.",
  },
  {
    step: "03",
    title: "Keep your principal, enter private draws",
    body: "Every draw picks a winner weighted by how much you saved and for how long. Your weight, your odds, the winner and the prize all stay encrypted. Your savings stay withdrawable throughout.",
  },
];

const PROOF_ROWS = [
  { label: "Individual balances", state: "encrypted" as const, value: "Encrypted" },
  { label: "Individual draw weights", state: "encrypted" as const, value: "Encrypted" },
  { label: "Aggregate draw weight", state: "public" as const, value: "Published, then proved" },
  { label: "Random target", state: "encrypted" as const, value: "Encrypted" },
  { label: "Candidate accepted", state: "verified" as const, value: "Verified" },
  { label: "Prefix equals aggregate", state: "verified" as const, value: "Verified" },
  { label: "Winner", state: "encrypted" as const, value: "Encrypted" },
  { label: "Prize", state: "encrypted" as const, value: "Encrypted" },
  { label: "Principal spent on prizes", state: "verified" as const, value: "0" },
];

export default function LandingPage() {
  return (
    <>
      <SiteHeader surface="light" />

      <main id="main">
        {/* 1 — Hero. Light lavender wash, the only place it appears. */}
        <section className="hero-wash">
          <div className="container-serein grid items-center gap-14 py-20 md:py-28 lg:grid-cols-[1.05fr_auto] lg:gap-20">
            <div className="max-w-xl space-y-7">
              <Badge tone="light">Sepolia testnet · Zama Protocol</Badge>

              <h1 className="text-heading-lg font-medium sm:text-[3.25rem] sm:leading-[1.02] sm:tracking-[-0.04em] lg:text-display">
                Private savings.
                <br />
                Fair prizes.
              </h1>

              <p className="text-lead text-iron">
                Save private test USDC into a shared prize pool. Your balance and odds stay
                encrypted. Your chance to win stays mathematically fair. Your principal stays yours.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/app" tone="violet" size="lg">
                  Start saving
                </ButtonLink>
                <ButtonLink href="/docs/how-it-works" tone="ghost-light" size="lg">
                  See how fairness works
                </ButtonLink>
              </div>

              <p className="text-caption text-iron">
                No sign-up. Connect a wallet, claim test tokens, and complete the whole cycle in a
                few minutes.
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <SavingsCardPreview />
            </div>
          </div>
        </section>

        {/* 2 — The problem, shown rather than argued. */}
        <section className="bg-paper py-20 md:py-24">
          <div className="container-serein space-y-12">
            <SectionHeading
              surface="light"
              eyebrow="The problem"
              title="Saving onchain shouldn't publish your balance."
              lead="Prize savings pools are transparent by construction. That transparency is what makes them verifiable — and it is also what turns every saver's position, history and odds into public data."
            />
            <DisclosureComparison />
          </div>
        </section>

        {/* 3 — How it works, three plain stages. */}
        <section className="bg-bone py-20 md:py-24">
          <div className="container-serein space-y-12">
            <SectionHeading
              surface="light"
              eyebrow="How it works"
              title="Three steps, then it runs itself."
            />
            <ol className="grid gap-5 md:grid-cols-3">
              {STAGES.map((stage) => (
                <li key={stage.step} className="rounded-card border border-ash/50 bg-paper p-6">
                  <p className="tabular text-caption font-medium text-violet">{stage.step}</p>
                  <h3 className="mt-3 text-subheading">{stage.title}</h3>
                  <p className="mt-2 text-small text-iron">{stage.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 4 — The hard cut. Everything below here is the product surface. */}
        <section className="bg-midnight py-20 text-white md:py-28">
          <div className="container-serein space-y-14">
            <SectionHeading
              eyebrow="Exact fairness"
              title="Fairness survives encryption."
              lead="Winner selection is exact, not an approximation of exact. Every participant's chance is their share of the pool's time-weighted savings — computed under encryption, verified on chain."
              align="center"
            />

            <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
              <div className="space-y-6">
                <p className="text-body text-white/70">
                  Picking a winner in proportion to hidden weights needs a uniform random number over
                  the pool&apos;s total. The coprocessor will only draw random numbers bounded by a
                  power of two, and a pool&apos;s total is never a power of two.
                </p>
                <p className="text-body text-white/70">
                  Serein closes that gap with rejection sampling: draw over the next power of two,
                  keep the number only if it lands below the real total, otherwise draw again.
                  Conditioned on acceptance the result is exactly uniform — no rounding, no
                  approximation, no bias toward large savers.
                </p>
                <div className="rounded-card border border-white/10 bg-abyss p-5">
                  <p className="font-mono text-caption leading-relaxed text-white/75">
                    B = nextPowerOfTwo(T)
                    <br />r ~ Uniform[0, B)
                    <br />
                    accept iff r &lt; T<br />
                    <span className="text-violet">P(r = x | r &lt; T) = 1/T</span>
                  </p>
                </div>
                <ButtonLink href="/docs/how-it-works" tone="ghost-dark">
                  Read the argument
                </ButtonLink>
              </div>

              <Card surface="deep" className="p-7">
                <div className="flex items-center justify-between">
                  <p className="text-small text-white/55">Draw transcript</p>
                  <StatusPill state="verified">Finalized</StatusPill>
                </div>
                <dl className="mt-5">
                  {PROOF_ROWS.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-4 border-b border-white/10 py-3 last:border-b-0"
                    >
                      <dt className="text-small text-white/60">{row.label}</dt>
                      <dd>
                        <StatusPill state={row.state}>{row.value}</StatusPill>
                      </dd>
                    </div>
                  ))}
                </dl>
                <ButtonLink href="/proof" tone="ghost-dark" className="mt-6" fullWidth>
                  Open the live proof view
                </ButtonLink>
              </Card>
            </div>
          </div>
        </section>

        {/* 5 — No-loss, drawn as the structure it actually is. */}
        <section className="bg-abyss py-20 text-white md:py-24">
          <div className="container-serein space-y-12">
            <SectionHeading
              eyebrow="No loss by construction"
              title="Prizes can't come from your savings."
              lead="Not because an administrator promises it. Because the code that spends prize money has no path to the contract that holds principal."
            />

            <div className="grid gap-5 md:grid-cols-2">
              <Card className="space-y-4">
                <Eyebrow>Your money</Eyebrow>
                <p className="text-subheading">Savings pool</p>
                <p className="text-small text-white/65">
                  Holds every saver&apos;s encrypted principal. It can compute draw weights and move
                  your own balance back to you. It has no authority over prize funds, and no function
                  that spends them.
                </p>
                <div className="rounded-badge bg-white/[0.06] px-3 py-2 text-caption text-white/60">
                  Your principal → Savings pool → back to you
                </div>
              </Card>

              <Card className="space-y-4">
                <Eyebrow>Prize money</Eyebrow>
                <p className="text-subheading">Prize reserve</p>
                <p className="text-small text-white/65">
                  Funded separately, holds no principal, and pays at most one prize per draw. All the
                  savings pool can tell it is an encrypted yes-or-no about who won — a value the pool
                  itself cannot read.
                </p>
                <div className="rounded-badge bg-white/[0.06] px-3 py-2 text-caption text-white/60">
                  Prize funding → Prize reserve → winner
                </div>
              </Card>
            </div>

            <p className="max-w-3xl text-small text-white/50">
              Network gas fees still apply and are not principal. On Sepolia the prize reserve is
              funded by an operator rather than by real yield — Serein calls that what it is and does
              not display an APY it cannot measure.
            </p>
          </div>
        </section>

        {/* 6 — The leakage ledger, verbatim from the shared source. */}
        <section className="bg-midnight py-20 text-white md:py-24">
          <div className="container-serein space-y-10">
            <SectionHeading
              eyebrow="What is public"
              title="The exact disclosure ledger."
              lead="Serein does not claim to be anonymous or untraceable. It claims something narrower and checkable: this is what a public chain can see, and this is what it cannot."
              action={
                <ButtonLink href="/docs/privacy" tone="ghost-dark">
                  Full privacy notes
                </ButtonLink>
              }
            />

            <div className="overflow-x-auto rounded-card border border-white/10">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <caption className="sr-only">
                  What Serein discloses publicly and what stays encrypted
                </caption>
                <thead>
                  <tr className="border-b border-white/10 text-caption text-white/50">
                    <th scope="col" className="px-5 py-3 font-medium">
                      Information
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Public?
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Why
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {LEAKAGE_LEDGER.map((row) => (
                    <tr key={row.item} className="border-b border-white/10 last:border-b-0">
                      <th scope="row" className="px-5 py-3.5 text-small font-normal">
                        {row.item}
                      </th>
                      <td className="px-5 py-3.5">
                        <StatusPill
                          state={
                            row.disclosure === "public"
                              ? "public"
                              : row.disclosure === "private"
                                ? "encrypted"
                                : "pending"
                          }
                        >
                          {row.disclosure === "public"
                            ? "Public"
                            : row.disclosure === "private"
                              ? "Encrypted"
                              : "Boundary"}
                        </StatusPill>
                      </td>
                      <td className="px-5 py-3.5 text-small text-white/60">{row.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Card surface="deep" className="max-w-3xl">
              <h3 className="text-subheading">A caveat worth stating plainly</h3>
              <p className="mt-2 text-small text-white/65">
                The published aggregate is a sum. With one participant it is that participant&apos;s
                weight. With two, either can subtract their own to learn the other&apos;s. Privacy
                here is real but it is not magic — it depends on there being other savers, and the
                app shows a warning when the pool is small enough for this to matter.
              </p>
            </Card>
          </div>
        </section>

        {/* 7 — Final CTA. White filled pill plus a ghost, on dark. */}
        <section className="bg-abyss py-24 text-white">
          <div className="container-serein max-w-3xl space-y-7 text-center">
            <h2 className="text-heading md:text-heading-lg">Save privately on Sepolia.</h2>
            <p className="text-lead text-white/65">
              Claim test tokens, make them private, and add savings. The whole cycle takes a few
              minutes and costs nothing but test gas.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/app" tone="light" size="lg">
                Start saving
              </ButtonLink>
              <ButtonLink href="/proof" tone="ghost-dark" size="lg">
                Inspect a live draw
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter surface="dark" />
    </>
  );
}
