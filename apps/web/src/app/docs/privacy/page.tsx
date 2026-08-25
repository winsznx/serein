import type { Metadata } from "next";

import { DocSection, DocTitle, Note, P } from "@/components/prose";
import { LEAKAGE_LEDGER } from "@serein/protocol-sdk";

export const metadata: Metadata = {
  title: "What is public",
  description:
    "The exact information-leakage ledger for Serein: what a public chain can see, what stays encrypted, and where the boundaries are.",
};

/**
 * The privacy ledger, rendered from the same source the protocol package exports.
 *
 * One table, one definition, used by the landing page, this page and PRIVACY.md. A second copy would
 * eventually disagree with the first, and on this particular subject a disagreement is a false
 * claim.
 */
export default function PrivacyPage() {
  return (
    <>
      <DocTitle lead="Serein does not claim to be anonymous, untraceable, or fully private. It claims something narrower and checkable. This page is that claim.">
        What is public and what is not
      </DocTitle>

      <DocSection title="The ledger">
        <div className="overflow-x-auto rounded-card border border-ash/50">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <caption className="sr-only">Serein information disclosure ledger</caption>
            <thead>
              <tr className="border-b border-ash/50 bg-bone text-caption text-iron">
                <th scope="col" className="px-4 py-3 font-medium">
                  Information
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Disclosure
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Why
                </th>
              </tr>
            </thead>
            <tbody>
              {LEAKAGE_LEDGER.map((row) => (
                <tr key={row.item} className="border-b border-ash/40 last:border-b-0">
                  <th scope="row" className="px-4 py-3.5 text-small font-normal text-midnight">
                    {row.item}
                  </th>
                  <td className="px-4 py-3.5">
                    <span className="inline-block rounded-badge bg-bone px-2 py-0.5 text-caption font-medium text-midnight">
                      {row.disclosure === "public"
                        ? "Public"
                        : row.disclosure === "private"
                          ? "Encrypted"
                          : "Boundary"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-small text-iron">{row.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection title="The aggregate, and when it matters">
        <P>
          One number per draw is published deliberately: the total draw weight, summed across every
          participant, released only after that draw&apos;s window has closed. Exact weighted
          selection needs it, and the alternative is an approximate draw.
        </P>
        <Note>
          A sum only hides the parts when there are enough of them. With a single saver, the total
          is that saver&apos;s weight. With two, either can subtract their own to learn the
          other&apos;s. With a handful, it narrows everyone&apos;s range. The app shows a warning
          whenever the pool is small enough for this to bite, and it does not describe a two-person
          pool as private.
        </Note>
      </DocSection>

      <DocSection title="Boundaries that are visible by construction">
        <P>
          Wrapping public test USDC into its confidential form is an ordinary ERC-20 transfer, and
          the amount is visible. So is unwrapping. Serein cannot hide that and does not pretend to —
          the Make private step says so before you sign it. What is hidden is everything downstream:
          how much of that you saved, your weight, your odds, your result.
        </P>
        <P>
          The same applies to the prize source. Topping it up crosses the transparent boundary, so
          the total ever funded is public. How that total is split between individual draws is sent
          as an encrypted input and is not.
        </P>
      </DocSection>

      <DocSection title="What the app itself never does">
        <P>
          When you reveal a value, the plaintext exists only in your browser tab, in memory. It is
          not written to local storage, not put in a cookie, not sent to any server, and not
          included in any error report. Switching wallet or network clears it immediately, so a
          balance can never appear attributed to an account it does not belong to.
        </P>
        <P>
          There is no analytics SDK, no third-party script, and no telemetry on financial values.
          The only network calls the app makes are to the chain, to the Zama relayer, and to its own
          read-only RPC proxy.
        </P>
      </DocSection>

      <DocSection title="Residual leaks we are not going to hand-wave">
        <P>
          Your address is public, and so is the fact that it interacted with Serein. Transaction
          timing is public: if you deposit at an unusual hour, that is observable. Gas costs differ
          slightly between code paths, so a determined observer can sometimes distinguish which
          function you called — though not the amounts inside it. And a participant registry has to
          be public and ordered for the draw walk to be verifiable at all.
        </P>
        <P>
          None of that is a bug. It is the cost of running on a public chain, and it is better
          stated than discovered.
        </P>
      </DocSection>
    </>
  );
}
