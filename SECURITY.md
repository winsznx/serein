# Security model

What each party can do, what they structurally cannot, and the limits Serein is not hiding.

Serein has **not been independently audited**. It runs on Sepolia with tokens that have no monetary
value.

---

## 1. Actors

### Curious observer

**Can:** read every address that touched Serein, when, and which function it called; read the
published aggregate weight of any closed draw; read every ciphertext handle from storage.

**Cannot:** decrypt any individual balance, weight, odds, result, or prize; decrypt the random
target; reconstruct a balance from historical observations.

**Defence:** ACL grants are per-handle and explicit. Only three handle classes are ever marked
publicly decryptable — the frozen aggregate and the two verification booleans. Handles are pointers;
turning one into a number requires a grant that private values never carry.

**Proof:** `adversarial.fhe.test.ts` attempts each of these and requires refusal. The live campaign
repeats four of them against the real relayer every run and aborts if any succeeds.

### Another saver

**Can:** everything an observer can, plus decrypt their own balance and their own result.

**Cannot:** decrypt anyone else's; directly learn the winner from claim calldata, events, or
confidential transfer amounts.

**Defence:** each value is granted to exactly one address. Claims are uniform: every participant
calls the same function, a non-winner moves an encrypted zero, and the transaction, event and gas are
indistinguishable. Live draws #2 and #3 show all three participants claiming at 399,406–399,410 gas.

**Residual:** the fact that an address claimed is public. User behavior can still create a
side-channel inference when participants follow different claiming patterns.

### The keeper

**Can:** spend its own gas calling functions anyone else can call.

**Cannot:** move principal, choose or influence a winner, decrypt anything, alter epoch boundaries,
skip a participant, or finalize an inconsistent draw.

**Defence:** there is no keeper role in the contracts. Every progression function is unauthenticated.
A compromised keeper delays draws; that is the whole blast radius.

**Proof:** the test suite drives a complete draw from a signer that has never touched the protocol,
and resumes an interrupted draw from a _different_ address mid-selection.

### The prize funder

**Can:** add money to the reserve and allocate it to a draw that has not closed.

**Cannot:** touch principal, change a draw in flight, or affect selection.

**Defence:** the reserve holds no principal and the pool exposes no spending authority over prize
funds. `freezePrize` is called by the pool at close; funding a frozen draw returns encrypted `false`
and the token refunds the sender rather than stranding value.

### The deployer

**Can:** nothing ongoing.

**Cannot:** select a winner, pause, seize funds, or change a rule. `SereinPool` has no owner, no
admin function, and no upgrade path. The reserve's single owner action — binding it to a pool and
source — is one-shot and already spent.

**Proof:** an ABI-level test asserts the pool exposes no `owner`, `setWinner`, or `pickWinner`, and
the reserve no `withdraw`, `sweep`, or `rescue`.

---

## 2. Confidentiality

| Threat                                                  | Defence                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unauthorized user decryption                            | Per-handle ACL; the relayer enforces it. Tested cross-wallet, live and in mock.                                                                                                                                                            |
| ACL overgrant                                           | Every persistent handle has a documented access plan (ARCHITECTURE.md §7). Historical observations are granted to the contract **and to nobody else, including their owner** — two cumulative points reconstruct the balance between them. |
| Accidental `makePubliclyDecryptable` on a private value | Called in exactly three places, each on a value whose disclosure is analysed in PRIVACY.md. Public decryptability is permanent, so this is a one-way door and is treated as one.                                                           |
| Cross-contract handle leakage                           | The winner predicate crosses to the reserve **transiently**, for one call, and is never persisted outside it.                                                                                                                              |
| Winner or prize leakage                                 | Neither is ever public or user-decryptable. Claims are uniform.                                                                                                                                                                            |
| Frontend logging plaintext                              | Revealed values live in memory in one tab: not `localStorage`, not a cookie, never in a fetch body, never in an error message. Cleared on wallet change, chain change, and page unload.                                                    |
| Analytics collecting values                             | No analytics SDK, no third-party script, no telemetry.                                                                                                                                                                                     |

**Residual, stated plainly:** addresses are public. Transaction timing is public. Gas differs between
code paths, so an observer can often tell _which_ function you called, though not the amounts inside
it. The participant registry must be public and ordered for the walk to be verifiable at all.

---

## 3. FHE correctness

**Overflow is the sharpest edge here.** Encrypted addition does not revert; it wraps and returns a
ciphertext indistinguishable from a correct one. There is no exception to catch and nothing
downstream notices.

Serein's answer is a bound proved _before_ every operation, enforced at the single point where value
enters — the deposit callback. A deposit that would breach the total-principal cap makes the receiver
return encrypted `false`, and the token refunds the sender. It does **not** clamp, because clamping
would take someone's money and credit them less.

The intermediate `total + amount` computed before the comparison cannot itself wrap, because the
amount is zeroed first if it exceeds the cap and `2 × MAX_TOTAL_PRINCIPAL < 2^64`. The full chain is
in ARCHITECTURE.md §5 and mirrored in the reference model, where `assertBoundsAreSound()` runs at
import time and in tests.

Other cases: uninitialized handles are explicitly replaced with a trivial zero before use;
`FHE.isInitialized` guards every read of a possibly-unwritten handle; encrypted types are never cast
downward.

---

## 4. ERC-7984 integration

| Threat                              | Defence                                                                                                                                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator abuse                      | The deposit path uses `confidentialTransferAndCall`, so no standing operator permission is ever granted.                                                                                                                               |
| Transfer clamp vs. requested amount | The callback carries the amount that _actually_ moved. Withdrawals decrement by what the token reports transferring, not what was requested, so the books cannot drift from the real balance.                                          |
| Receiver callback ACL error         | The return value is granted twice — `allowThis` for the library's own check, `allowTransient` to the token for its `select`. Both are required; omitting either reverts. Found by reading OpenZeppelin's source, and covered by tests. |
| Double refund                       | The receiver never moves tokens itself. It returns a boolean and lets the token refund.                                                                                                                                                |
| Reentrancy                          | Withdrawals use a plain `confidentialTransfer` with no callback, and carry a reentrancy guard regardless.                                                                                                                              |

---

## 5. Draw integrity

| Threat                                    | Defence                                                                      | Tested                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Admin winner selection                    | No such function exists                                                      | ABI assertion                                                      |
| Forged aggregate                          | `FHE.checkSignatures` verifies the KMS signed _that value_ for _that handle_ | Submitting `total + 1` with a real proof reverts                   |
| Proof from another draw                   | Handles differ, so signature verification fails                              | Draw #1's proof rejected for draw #2                               |
| Replayed proof                            | The state machine only moves forward                                         | Second submission reverts                                          |
| Randomness reuse                          | A rejected candidate is erased from storage                                  | Verified after rejection                                           |
| Skipped or duplicated participant         | Monotonic cursor; batches start where the last stopped                       | Cursor asserted across batches                                     |
| Cursor rollback on failure                | A reverting batch leaves the cursor unmoved                                  | Batch-too-large reverts leave it untouched                         |
| Double finalization                       | Status check                                                                 | Second call reverts                                                |
| Zero-weight winner                        | Empty half-open interval; no point can lie inside                            | Structural, plus corpus-wide                                       |
| Post-close balance change altering weight | Weight reads two frozen historical points                                    | Live: withdrawals at three draw stages, consistency still verified |
| Inconsistent draw finalizing              | `P == T` verified through the KMS before finalization                        | Enforced; failure blocks finalization                              |

---

## 6. Liveness

Every step is permissionless. If every keeper stops, savers keep depositing and withdrawing and
anyone can finish an in-flight draw from a browser.

**Withdrawals have no dependency on draw state at all** — closed, proof outstanding, mid-selection,
keepers offline. This is tested at each stage and is the single most important liveness property,
because it is what makes "no-loss" true even when the protocol is stuck.

Failure modes and responses:

| Failure                                            | Response                                                                                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relayer drops a body under load                    | Retry with exponential backoff. Observed live; the draw completes.                                                                                                                              |
| RPC times out                                      | Raised timeout; the campaign is resumable and re-reads state before acting.                                                                                                                     |
| Batch exceeds HCU, or the block's remaining budget | Cursor unmoved; keeper halves the batch and retries.                                                                                                                                            |
| Keeper disappears mid-draw                         | Any address resumes from the stored cursor. Tested with a different signer.                                                                                                                     |
| Consistency check fails                            | The draw stays unfinalized. Principal is untouched, the prize stays in the reserve, claims require a finalized draw. This is deliberate: an unexplained inconsistency should stop, not pay out. |

---

## 7. Frontend

| Threat                                | Defence                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Wrong or stale contract address       | One committed manifest, imported at build time. A stale address is a build failure, not a runtime surprise.     |
| XSS                                   | No `dangerouslySetInnerHTML`, no `eval`, no user-controlled markup. CSP `script-src 'self' 'wasm-unsafe-eval'`. |
| Third-party script compromise         | There are none. The Zama SDK is vendored same-origin.                                                           |
| CSP drift                             | Built from the real dependency graph in `next.config.ts` and verified against the deployed headers.             |
| RPC response poisoning                | The proxy forwards read methods only and cannot sign. Everything displayed is checkable on a block explorer.    |
| Network confusion                     | Wrong-network is a first-class screen with a one-tap fix; writes are blocked until the chain matches.           |
| Balance shown under the wrong account | Revealed values are cleared on any wallet or chain change, at the provider level.                               |

The RPC proxy deliberately refuses `eth_sendRawTransaction`. Wallets broadcast their own
transactions, so relaying them would add a censorship point for no benefit.

---

## 8. Known limitations

- **Not audited.**
- **Confidentiality depends on the Zama KMS** being honest and available. A compromised KMS could
  expose encrypted values.
- **The public relayer is a shared service** and a real availability dependency for encryption and
  reveal. Draw progression tolerates its failures; a saver's reveal simply has to be retried.
- **The aggregate is a genuine disclosure** and a large one in a small pool. Surfaced in the app.
- **The prize source is a mock.** An operator funds it. No APY is displayed because none is measured.
- **Storage and walk cost grow** with participants; the practical ceiling is in BENCHMARKS.md.
- **Gas is not principal.** Savers pay it, and it is disclosed separately.

## Reporting

Open an issue, or for anything sensitive, contact the maintainers privately before disclosing.
