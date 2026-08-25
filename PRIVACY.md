# Privacy

Serein does not claim to be anonymous, untraceable, or "fully private". It claims something narrower
and checkable, and this document is that claim.

The same ledger is rendered in the app at [`/docs/privacy`](https://serein.timjosh507.workers.dev/docs/privacy)
from a single shared source (`packages/protocol-sdk/src/protocol.ts`), so the two cannot drift apart.

---

## The disclosure ledger

| Information                                          | Public?               | Why                                                                                                                                       |
| ---------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| That a wallet interacted with Serein                 | **Yes**               | Ordinary transaction metadata on a public chain. Nothing can hide this.                                                                   |
| Participant addresses                                | **Yes**               | The registry must be public and ordered so the draw walk is deterministic and anyone can verify nobody was skipped.                       |
| Your savings balance                                 | No                    | `euint64`. Only you can decrypt it.                                                                                                       |
| Your balance history                                 | No                    | Encrypted TWAB observations, readable by the contract alone — **not even by you**, since two points reconstruct the balance between them. |
| Your draw weight                                     | No                    | `euint128`, computed under encryption, never decrypted.                                                                                   |
| Your odds                                            | No                    | Derived from your weight, which stays encrypted.                                                                                          |
| Number of participants                               | **Yes**               | Operational state needed to verify the draw covered everyone.                                                                             |
| Draw timestamps and state                            | **Yes**               | Needed for liveness and so anyone can push a stalled draw forward.                                                                        |
| **Total draw weight, after the draw closes**         | **Yes, deliberately** | See below.                                                                                                                                |
| The random target                                    | No                    | Never decrypted, never granted to any address.                                                                                            |
| Whether a candidate was accepted                     | **Yes**               | A yes-or-no verification result. Says nothing about the candidate's value.                                                                |
| Number of rejection attempts                         | **Yes**               | Operational transcript, already visible from transactions.                                                                                |
| Who won                                              | No                    | An encrypted boolean per participant.                                                                                                     |
| The prize amount                                     | No                    | Allocated as an encrypted input, credited under encryption.                                                                               |
| That an address called claim or withdraw             | **Yes**               | Transaction metadata. The amounts are encrypted; the call is not.                                                                         |
| Amounts wrapped into / out of the confidential token | **Boundary**          | Wrapping crosses from a transparent ERC-20, so that amount is visible. Everything after it is not.                                        |
| Total ever funded into the prize source              | **Boundary**          | Same transparent boundary. How that total is split between draws is encrypted.                                                            |

---

## The aggregate, and when it stops protecting you

One number per draw is published on purpose: the total draw weight, summed across every participant,
released only after that draw's window is frozen.

**Why it has to be public.** Selecting uniformly across an arbitrary total requires that total in the
clear, and the coprocessor's bounded randomness only accepts a power-of-two ceiling. Without it the
draw would have to approximate — scale, round, or score-and-argmax — and every one of those
introduces bias. A prize draw with quiet bias is not a fair draw. The full argument is in
[ARCHITECTURE.md §3](ARCHITECTURE.md#3-exact-weighted-selection).

**Why it is usually safe.** It is a sum over everyone, disclosed after the interval it covers is
already closed, and it is not anyone's balance, weight, or odds.

**When it is not safe.** A sum only hides its parts when there are enough of them:

- **One participant:** the total _is_ that participant's weight. Complete disclosure.
- **Two participants:** either can subtract their own weight to learn the other's.
- **Three or four:** the total narrows everyone's range considerably.

The app displays a warning at each of these thresholds and does not describe a two-person pool as
private. That is the honest position: privacy here is real, but it depends on there being other
savers, and pretending otherwise would be the exact failure the product exists to avoid.

---

## What the app itself never does

- **Plaintext never leaves the tab.** A revealed value is held in a module-scoped map in memory. Not
  `localStorage`, not `sessionStorage`, not a cookie, never in a fetch body. A page refresh drops it.
- **Nothing decrypted is ever logged.** Not to the console, not into an error message. The relayer's
  own error is attached as a `cause` for debugging but is never printed, because an exception
  carrying a balance is a leak with a stack trace attached.
- **Values are cleared on any account or chain change**, at the provider level, so a balance can never
  appear attributed to an account it does not belong to.
- **No analytics.** No third-party SDK, no telemetry, no financial-value events. The only network
  calls are to the chain, the Zama relayer, and the app's own read-only RPC proxy.
- **The RPC proxy sees no secrets.** It forwards read methods only, never signs, and refuses
  `eth_sendRawTransaction` — wallets broadcast their own transactions.
- **One cookie, and what is in it.** Wallet connection state is kept in a `wagmi.store` cookie so a
  refresh does not look like a logout. It holds the connected address, the chain id and which
  connector was used — no keys, no signatures, nothing decrypted. Because it is a cookie rather than
  `localStorage`, that address is sent to the Serein server on every request. It is public
  information and the RPC proxy already sees queries about it, but it is a real change in what the
  server observes and it is listed here rather than left for someone to discover in devtools.

---

## Residual leaks we are not going to hand-wave

- **Your address is public**, and so is the fact it interacted with Serein.
- **Timing is public.** Depositing at an unusual hour is observable.
- **Gas costs differ between code paths**, so a determined observer can often tell which function you
  called, though not the amounts inside it.
- **The participant registry is public and ordered.** It has to be, for the walk to be verifiable.
- **The wrap boundary is visible.** The app says so on the Make private step, before you sign it,
  rather than letting you discover it afterwards on a block explorer.
- **Claiming is visible**, though the outcome is not — every participant's claim is the same function,
  the same event, and within a few gas of the same cost.

None of these are bugs. They are the cost of running on a public chain, and they are better stated
than discovered.

---

## Verifying the claims

The live campaign probes four of these on every run and aborts if any succeeds:

```
REFUSED  public decryption of the random target
REFUSED  public decryption of a participant's savings balance
REFUSED  participant B decrypting participant A's savings balance
REFUSED  decryption of participant A's historical observation
ALLOWED  public decryption of the frozen aggregate → 360000000000 (matches on-chain: true)
```

The refusals carry Zama's own reasons — _"Handle … is not publicly decryptable"_, _"User address …
is not authorized"_ — recorded verbatim in [`evidence/live/draws/`](evidence/live/draws/).

The proof view prints the random target's handle so you can attempt this yourself.

**A note on how these are tested.** A transient network error looks exactly like a refusal if you
only check that the call threw. The campaign distinguishes them: transport failures are retried, and
if a probe cannot be resolved either way the run fails rather than recording an unproven claim as a
proven one.
