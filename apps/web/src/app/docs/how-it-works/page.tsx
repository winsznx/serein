import type { Metadata } from "next";

import { CodeBlock, DocSection, DocTitle, Note, P, Steps } from "@/components/prose";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Serein keeps savings balances and prize odds encrypted while still running a mathematically exact weighted draw.",
};

export default function HowItWorksPage() {
  return (
    <>
      <DocTitle lead="Serein is a savings account that runs a prize draw. The savings are private, the draw is exactly fair, and your principal is never at risk. Here is how each of those works.">
        How Serein works
      </DocTitle>

      <DocSection title="The short version">
        <P>
          You put test USDC into a shared pool. The pool records your balance as a ciphertext it can
          compute on but cannot read. Every fifteen minutes it runs a draw, weighted by how much you
          saved and for how long, and pays a prize funded separately from anyone&apos;s savings. You
          can take your money out whenever you like, including in the middle of a draw.
        </P>
      </DocSection>

      <DocSection title="Why weight depends on time">
        <P>
          If a draw only looked at balances at the closing moment, the winning strategy would be to
          deposit one second before it closes and withdraw one second after. Everyone who actually
          kept money in the pool would be subsidising that.
        </P>
        <P>
          So weight is the area under your balance over the epoch — balance multiplied by the time
          you held it, added up. Hold 100 for the whole epoch and you get the same weight as holding
          200 for half of it. This is the same mechanism PoolTogether uses, with one difference:
          here the balance is encrypted.
        </P>
        <P>
          That difference works because the protocol splits what has to be public from what does
          not. Timestamps are public — they are already visible from your transactions — so the
          contract can search its history and multiply by elapsed time. Only the balance itself, and
          the running total, are ciphertexts.
        </P>
        <Note>
          Because weight is read from two frozen points in history, a withdrawal after a draw closes
          cannot change the weight that draw already assigned you. That is what makes it safe to
          keep withdrawals open at every stage.
        </Note>
      </DocSection>

      <DocSection title="Why one number is published">
        <P>
          To pick a winner in proportion to hidden weights, you need a random number spread evenly
          across the pool&apos;s total weight. The encryption coprocessor will generate a random
          number bounded by a power of two, and nothing else. A pool&apos;s total is essentially
          never a power of two.
        </P>
        <P>
          The gap could be closed by approximating — scaling, rounding, or scoring each participant
          and taking the highest. Every one of those introduces bias, and a prize draw with quiet
          bias is not a fair one. Serein does not do that.
        </P>
        <P>
          Instead it publishes one number, once per draw, after that draw&apos;s window is already
          frozen: the total weight, summed across everyone. Then it samples over the next power of
          two above that total, and throws the number away if it lands too high.
        </P>
        <CodeBlock>{`B = nextPowerOfTwo(T)        // so that T <= B < 2T
r ~ Uniform[0, B)
accept iff r < T

P(r = x | r < T) = (1/B) / (T/B) = 1/T`}</CodeBlock>
        <P>
          Conditioned on acceptance, every value below the total is equally likely — exactly, not
          approximately. A rejected candidate tells you only that it was too big, which says nothing
          about which value below the total would have come up, so drawing a fresh one keeps the
          result uniform. Since the bound is less than twice the total, more than half of candidates
          are accepted and the draw needs fewer than two attempts on average.
        </P>
        <P>
          The published total is a sum. It is not your balance, not your weight, and not your odds.
          It is the one disclosure the mechanism genuinely requires, and it is listed as such in the
          privacy ledger rather than buried.
        </P>
      </DocSection>

      <DocSection title="Finding the winner without knowing who it is">
        <P>
          With a uniform random point inside the total, the protocol walks the participant list in
          public order, keeping a running encrypted total as it goes. Each participant owns the
          stretch between where the running total was before them and after them. Whoever&apos;s
          stretch contains the random point has won.
        </P>
        <P>
          Every part of that comparison is encrypted: the running total, the random point, and the
          yes-or-no answer for each participant. The contract performs the comparison without
          learning its result. Because the stretches tile the range with no gaps and no overlap,
          exactly one participant matches — and someone with no weight owns a stretch of zero
          length, which no point can fall inside.
        </P>
        <Note>
          The walk happens in batches. Encrypted operations are metered, and a single transaction
          can only do so many, so the cursor is stored on chain and anyone can push it forward. A
          batch that fails leaves the cursor untouched, so retrying is always safe.
        </Note>
      </DocSection>

      <DocSection title="Why your principal is never at risk">
        <P>
          Savings and prize money live in two different contracts. The savings pool has no function
          that spends prize funds. The prize reserve holds no savings and has no way to reach them.
          All the pool ever tells the reserve is an encrypted yes-or-no about who won — a value the
          pool cannot itself read.
        </P>
        <P>
          This is a structural property, not a policy. There is no administrator who could choose to
          spend principal on prizes, because no such code path exists. Network gas fees still apply,
          and those are not principal.
        </P>
      </DocSection>

      <DocSection title="What you actually do">
        <Steps
          items={[
            {
              title: "Get test USDC",
              body: "A public test token with no monetary value, minted directly to your wallet.",
            },
            {
              title: "Make it private",
              body: "Wrapping converts the public token into its confidential form. This transaction is visible on chain, including the amount — it is the boundary, and everything after it is encrypted.",
            },
            {
              title: "Add savings",
              body: "Your amount is encrypted in your browser before it is sent. The pool receives ciphertext and adds it to a balance it cannot read.",
            },
            {
              title: "Reveal, whenever you want to",
              body: "Your wallet signs a read authorisation and the relayer returns your plaintext to your browser alone. It is never stored and never sent to a server. It does not move funds.",
            },
            {
              title: "Collect and withdraw",
              body: "Everyone calls the same collect function, and a non-winner moves an encrypted zero — so collecting does not reveal your outcome. Your savings come out whenever you ask.",
            },
          ]}
        />
      </DocSection>

      <DocSection title="Check it yourself">
        <P>
          The proof view shows a live draw with every claim, its disclosure status, and the
          transaction that settled it. It also prints the random target&apos;s ciphertext handle so
          you can try to decrypt it and watch the relayer refuse.
        </P>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/proof" tone="dark">
            Open the proof view
          </ButtonLink>
          <ButtonLink href="/docs/privacy" tone="ghost-light">
            What exactly is public
          </ButtonLink>
        </div>
      </DocSection>
    </>
  );
}
