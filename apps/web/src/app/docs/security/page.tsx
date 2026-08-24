import type { Metadata } from "next";

import { DocSection, DocTitle, Note, P } from "@/components/prose";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Security model",
  description:
    "Serein's threat model: what each actor can do, what they structurally cannot, and the limitations we are not hiding.",
};

const THREATS = [
  {
    actor: "A curious observer",
    can: "Read every address that interacted with Serein, when, and which function they called. Read the published aggregate weight for any closed draw.",
    cannot:
      "Read any individual balance, weight, odds, result, or prize. Decrypt the random target. Reconstruct a balance from historical observations.",
  },
  {
    actor: "Another saver",
    can: "Everything an observer can, plus decrypt their own balance and their own result.",
    cannot:
      "Decrypt anyone else's balance or result — the ACL grants each value to exactly one address. Infer who won from claim transactions, because every participant's claim looks identical.",
  },
  {
    actor: "The keeper",
    can: "Spend its own gas calling functions that anyone else could call.",
    cannot:
      "Move principal, choose or influence a winner, decrypt anything, alter epoch boundaries, skip a participant, or finalize an inconsistent draw. A compromised keeper delays draws and nothing more.",
  },
  {
    actor: "The prize funder",
    can: "Add money to the prize reserve and allocate it to a draw that has not closed.",
    cannot:
      "Touch principal, change a draw already in flight, or affect selection. The reserve holds no savings and the pool exposes no spending authority.",
  },
  {
    actor: "The deployer",
    can: "Nothing ongoing. The pool has no owner, no admin function, and no upgrade path.",
    cannot:
      "Select a winner, pause the protocol, seize funds, or change a deployed rule. The prize reserve's one owner action — binding it to a pool and source — is single-shot and already spent.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <DocTitle lead="What each party can do, what they structurally cannot, and where the real limits are.">
        Security model
      </DocTitle>

      <DocSection title="Actors">
        <div className="space-y-4">
          {THREATS.map((threat) => (
            <div key={threat.actor} className="rounded-card border border-ash/50 p-5">
              <h3 className="text-body font-medium text-midnight">{threat.actor}</h3>
              <dl className="mt-3 space-y-2">
                <div>
                  <dt className="text-caption font-medium text-iron">Can</dt>
                  <dd className="text-small text-iron">{threat.can}</dd>
                </div>
                <div>
                  <dt className="text-caption font-medium text-iron">Cannot</dt>
                  <dd className="text-small text-iron">{threat.cannot}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection title="Why encrypted arithmetic needs bounds">
        <P>
          Encrypted addition does not revert on overflow. If a sum exceeds the type&apos;s range it
          wraps silently and produces a ciphertext indistinguishable from a correct one — there is no
          exception to catch and nothing downstream to notice. Correctness has to come from a bound
          proved before the operation, never from a check after it.
        </P>
        <P>
          Serein caps total principal at a value low enough that every subsequent quantity — each
          balance, each cumulative observation, each epoch weight, the aggregate, the randomness
          bound, and the running total during selection — provably stays inside its type. The cap is
          enforced at the single point where value enters: a deposit that would breach it makes the
          receiver return encrypted false, and the token refunds the sender rather than crediting a
          silently clamped amount.
        </P>
      </DocSection>

      <DocSection title="Why proofs cannot be forged or replayed">
        <P>
          Three points in a draw depend on a value only Zama&apos;s key management service can
          produce. At each, an untrusted caller submits a cleartext together with a KMS signature,
          and the contract verifies that the KMS signed that exact value for that exact ciphertext
          handle. A made-up number fails. A real number taken from a different draw fails, because it
          was signed against a different handle. Resubmitting an accepted proof fails on the state
          machine, which only moves forward.
        </P>
      </DocSection>

      <DocSection title="Liveness">
        <P>
          Every step of a draw is callable by anyone. If the keeper stops, draws stop being punctual
          and nothing else happens: savers keep depositing, keep withdrawing, and anyone can finish
          an in-flight draw. A failed batch leaves the cursor exactly where it was, so retrying never
          double-processes a participant.
        </P>
        <Note>
          Withdrawals have no dependency on draw state at all. Principal comes out while a draw is
          closed, while a proof is outstanding, mid-selection, and with every keeper offline.
        </Note>
      </DocSection>

      <DocSection title="Limitations, stated plainly">
        <P>
          Serein has not been independently audited. It runs on a testnet with tokens that have no
          monetary value. Confidentiality depends on the Zama protocol&apos;s key management being
          honest and available — if the KMS were compromised, encrypted values could be exposed.
        </P>
        <P>
          The prize reserve is funded by an operator rather than by real yield, because no real
          confidential-yield venue exists on Sepolia to route savings through. Serein calls that a
          mock and does not display an APY it cannot measure.
        </P>
        <P>
          Storage grows with participants and with balance changes, and the selection walk grows with
          the participant count. The measured costs and where they stop being comfortable are in the
          benchmarks rather than glossed as &quot;scales&quot;.
        </P>
        <div className="pt-2">
          <ButtonLink href="/proof" tone="dark">
            Verify the claims against live state
          </ButtonLink>
        </div>
      </DocSection>
    </>
  );
}
