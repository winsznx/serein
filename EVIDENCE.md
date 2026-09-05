# Evidence

Every headline claim, mapped to the code that implements it, the test that checks it, the live
transaction that demonstrates it, and the limitation that qualifies it.

Raw artifacts are in [`evidence/`](evidence/). Nothing there is hand-written; every file is produced
by a command listed below.

Explorer prefix: `https://sepolia.etherscan.io/tx/`

---

## 1. Selection is exactly proportional to weight

**Claim.** `P(participant i wins) = W_i / ΣW`, exactly — not approximately, and not
`argmax(balance × random)`.

|                   |                                                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code**          | `contracts/libraries/ExactWeightedRandom.sol`, `SereinPool.processSelectionBatch`                                                                                                                                                                         |
| **Proof**         | [ARCHITECTURE.md §3.3](ARCHITECTURE.md#33-rejection-sampling) — conditional uniformity, written out                                                                                                                                                       |
| **Tests**         | `reference-model/test/weighted.test.ts` (17 tests); `contracts/test/adversarial.fhe.test.ts` — exactly one winner, never a zero-weight participant                                                                                                        |
| **Wide evidence** | 8 weight vectors × 200,000 samples, all inside a 99.99% Wilson interval → [`evidence/benchmarks/statistical-fairness.json`](evidence/benchmarks/statistical-fairness.json)                                                                                |
| **Live**          | Draw #2 [`0x73fe650c…`](https://sepolia.etherscan.io/tx/0x73fe650c8415b24e0e904cdf11381db1ec70ef748690c4ba31166e27f74f7557) · Draw #3 [`0x9a9b6920…`](https://sepolia.etherscan.io/tx/0x9a9b6920c2dfb29d9f38823330ac78e4f08dbc6407c08f830d18b259e303af5c) |
| **Reproduce**     | `pnpm proof:local`                                                                                                                                                                                                                                        |
| **Limitation**    | The statistical campaign uses a seeded test PRNG, not the on-chain CSPRNG. It supplements the proof; it is not the proof.                                                                                                                                 |

Two live draws produced different winners with different odds — participant-c on 9.9% in draw #2,
participant-b on 62.5% in draw #3 — which is what an unbiased draw looks like and what a
biggest-stake-wins shortcut would not produce.

---

## 2. Encrypted time-weighted balances are exact

**Claim.** The encrypted TWAB computes the same values as the plaintext specification.

|                |                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code**       | `contracts/libraries/EncryptedTWAB.sol`                                                                                                                                                                       |
| **Spec**       | `packages/reference-model/src/twab.ts`                                                                                                                                                                        |
| **Test**       | `contracts/test/parity.fhe.test.ts` — every observation read back out of storage, decrypted, and compared **field by field** against the model: timestamp, balance, and cumulative                            |
| **Live**       | Draw #2 aggregate `243,000,000,000`; Draw #3 `360,000,000,000`                                                                                                                                                |
| **Reproduce**  | `pnpm test:fhe`                                                                                                                                                                                               |
| **Limitation** | Parity is checked through the mock coprocessor's debug decryptor, which has no counterpart on a real network. The live check is weaker but independent: the published aggregate matches a hand-derived value. |

Both live aggregates match the value derived by hand from the deposit timestamps, to the unit. Draw
#3: 100 + 250 + 50 units held for a full 900-second epoch = 360,000,000,000.

---

## 3. Private values cannot be read by anyone else

**Claim.** Balances, history, weights, the random target, the winner, and prizes are unreadable
except by their owner where an owner exists.

|                |                                                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code**       | ACL grants throughout; access plan in [ARCHITECTURE.md §7](ARCHITECTURE.md#7-access-control)                                                                                                         |
| **Tests**      | `contracts/test/adversarial.fhe.test.ts` — 31 cases, including cross-wallet decryption, public decryption of a balance, decryption of a historical observation, and every route to the random target |
| **Live**       | Four probes on every campaign run, refused by the real relayer with Zama's own reasons — recorded verbatim in each draw artifact                                                                     |
| **Reproduce**  | `pnpm test:fhe`, then `pnpm proof:sepolia`                                                                                                                                                           |
| **Limitation** | Depends on the Zama KMS enforcing the ACL honestly. Serein cannot verify the KMS itself.                                                                                                             |

The probes are classified rather than merely caught: a transport failure is retried, and a probe that
cannot be resolved either way **fails the run** rather than being recorded as a refusal. A network
blip must not be able to masquerade as proof of confidentiality.

---

## 4. Principal is never spent on prizes

**Claim.** `principal_before_draw(u) == principal_after_draw(u)` for every participant, structurally.

|                |                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code**       | Two contracts with no path between them; the pool has no owner and no prize-spending function                                                                                      |
| **Tests**      | Principal unchanged across a draw and across other people's claims; ABI assertions that no `setWinner`, `pickWinner`, `owner`, `sweep`, or `rescue` exists                         |
| **Live**       | Draw #2 and #3: `principalConserved: true` for all three participants, decrypted before and after                                                                                  |
| **Artifacts**  | [`evidence/legacy-custom-token/live/draws/draw-2.json`](evidence/legacy-custom-token/live/draws/draw-2.json), [`draw-3.json`](evidence/legacy-custom-token/live/draws/draw-3.json) |
| **Limitation** | Gas is not principal and is paid by the saver. Disclosed separately.                                                                                                               |

Draw #3, decrypted before and after by each participant themselves: 100 → 100, 250 → 250, 50 → 50.

---

## 5. Withdrawals stay open, and over-withdrawal is clamped

**Claim.** Principal comes out at any draw stage, and asking for more than you hold takes exactly
what you hold rather than reverting.

|                    |                                                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Why it matters** | Reverting on "amount exceeds balance" would turn every failed transaction into an oracle for probing a private balance                                                                                                                                                                                          |
| **Code**           | `SereinPool._withdraw` — `FHE.min(requested, balance)`, no draw-state dependency                                                                                                                                                                                                                                |
| **Tests**          | Withdrawals at three separate draw stages, with the consistency proof still passing afterwards                                                                                                                                                                                                                  |
| **Live**           | Partial [`0xa69d964b…`](https://sepolia.etherscan.io/tx/0xa69d964b20bca66ed49037b227a669b23ffe393cbb4f804baa6f532ed7d6be0e) 100 → 75 exactly · 1000× over-withdrawal [`0x5d3a8f08…`](https://sepolia.etherscan.io/tx/0x5d3a8f0800c35efba85759c08a7fd347a6961c847f75cd7e4df47800cfe63198) → exactly 0, no revert |
| **Artifact**       | [`evidence/legacy-custom-token/live/withdrawal.json`](evidence/legacy-custom-token/live/withdrawal.json)                                                                                                                                                                                                        |
| **Reproduce**      | `hardhat run scripts/live-withdraw.ts --network sepolia`                                                                                                                                                                                                                                                        |

---

## 6. Draws are permissionless and resumable

**Claim.** Any address can drive a draw; a keeper holds no privilege; an interrupted draw resumes
from exactly where it stopped.

Demonstrated live twice: draw #6 on the original Serein-owned token, draw #3 again on the canonical
Zama-asset deployment after the migration. Same result both times. The keeper closed the draw,
verified the aggregate, accepted a candidate, walked **two of six** participants and stopped. A
different address — a participant wallet with no operational role — read the stored cursor and
finished the remaining four.

```
cursor at interrupt : 2 / 6      (operator 0xbD74…c3f2)
cursor at finish    : 6 / 6      (operator 0xedd9…4d3F)
consistency verified: true
```

The consistency proof is what makes this meaningful. Had the second operator skipped a participant
or re-walked one the first had already done, the encrypted prefix would not have matched the
published aggregate and the draw could not have finalized.

|                |                                                                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code**       | Every progression function unauthenticated; cursor in storage                                                                                                                                                                           |
| **Tests**      | A complete draw driven by a signer that never touched the protocol; a failed batch leaving the cursor unmoved                                                                                                                           |
| **Live**       | [`evidence/live/draws/draw-3-recovery.json`](evidence/live/draws/draw-3-recovery.json) (canonical), [`evidence/legacy-custom-token/live/recovery-draw-6.json`](evidence/legacy-custom-token/live/recovery-draw-6.json) (original token) |
| **Reproduce**  | `hardhat run scripts/live-recovery.ts --network sepolia`                                                                                                                                                                                |
| **Limitation** | Progression needs someone to pay gas. Absent a keeper, draws are late, not lost.                                                                                                                                                        |

---

## 7. Proofs cannot be forged or replayed

|           |                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code**  | `FHE.checkSignatures` at each of the three asynchronous boundaries                                                                                                                                                                                                                                                                                                                                   |
| **Tests** | Forged total (real proof, `value + 1`) reverts; empty proof reverts; draw #1's proof rejected for draw #2; replay reverts on the state machine                                                                                                                                                                                                                                                       |
| **Live**  | [`0x740229d2…`](https://sepolia.etherscan.io/tx/0x740229d29e1ef3cdc39395508f59bf2cb6190b4c57cd7af16e6a99779f26f8c0) (aggregate), [`0x8230efb4…`](https://sepolia.etherscan.io/tx/0x8230efb40c6b736dcf5eceaa7bd974f48e8a3250829c94e0ae0af5efbcac21aa) (acceptance), [`0x75f7d61f…`](https://sepolia.etherscan.io/tx/0x75f7d61f511b8a39eb55238c9a9c2f50701a93e2a3e44aaeadeb0214084147a6) (consistency) |

---

## 8. Batch sizing is safe

|                |                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Measured**   | 1,993,721 HCU per participant warm; 2,963,378 cold. Ceiling 20,000,000 per transaction.                                                            |
| **Test**       | `contracts/test/benchmark.hcu.test.ts` — fails if a reading comes back zero, so a field-name drift cannot make headroom assertions pass vacuously  |
| **Artifact**   | [`evidence/benchmarks/hcu.json`](evidence/benchmarks/hcu.json)                                                                                     |
| **Reproduce**  | `pnpm benchmark`                                                                                                                                   |
| **Limitation** | There is also a per-**block** cap, so a correctly-sized batch can still fail because of someone else's transaction. The keeper halves and retries. |

---

## 9. Invariants hold across a wide scenario space

|                       |                                                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Corpus**            | 10,000 deterministic scenarios, 12 shapes — equal weights, 1:2, 1:2:7, whale-and-minnows, late deposits, early withdrawals, zero-weight participants, churn, full exit, single participant, max bounds, random |
| **Coverage observed** | 2,896 multi-attempt draws, 4,480 clamped withdrawals, and the zero-weight path                                                                                                                                 |
| **Artifact**          | [`evidence/raw/scenario-corpus.json`](evidence/raw/scenario-corpus.json)                                                                                                                                       |
| **Reproduce**         | `pnpm proof:local`                                                                                                                                                                                             |
| **Limitation**        | **These are deterministic scenarios, not users.** They are evidence that the algorithm is the algorithm we claim, not evidence of adoption.                                                                    |

---

## 10. A post-close withdrawal does not alter a frozen weight

**Claim.** Weight is read from two frozen historical points, so activity after a draw closes cannot
change the entry that draw already assigned.

Draw #4 demonstrates this without a contrived setup. Participant A had exited completely and held
zero principal when results were claimed, yet was a full participant in draw #4 with 25% odds: their
withdrawal observations are timestamped 1787616456 and 1787616492, both after the epoch closed at 1787616228.

```
A: 100 × 900s =  90,000,000,000     (held the full epoch, withdrew afterwards)
B: 250 × 900s = 225,000,000,000
C:  50 × 900s =  45,000,000,000
                ---------------
   published  = 360,000,000,000     matches the on-chain verified aggregate
```

Anyone can check this: read `observationAt(A, i)` for the timestamps, `getDraw(4)` for the window and
the published aggregate, and do the multiplication.

|           |                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| **Code**  | `EncryptedTWAB.weightBetween` — two frozen lookups                                                                    |
| **Tests** | Withdrawals at three separate draw stages, consistency still verified                                                 |
| **Live**  | Draw #4, [`evidence/legacy-custom-token/live/draws/draw-4.json`](evidence/legacy-custom-token/live/draws/draw-4.json) |

---

## 11. The zero-weight path works

Not a designed demo — draw #1 hit it by accident, and the protocol handled it correctly. All three
deposits landed 120 seconds _after_ draw #1's window closed, so its aggregate verified as `0` and it
finalized with `hasWinner: false` rather than attempting `nextPowerOfTwo(0)`.

Close [`0xcf4beaa4…`](https://sepolia.etherscan.io/tx/0xcf4beaa418f99dc6072ee6dbe407814871cf79078e32c3a9855d28ccac059a52) is draw #2's; draw #1's transcript is in the campaign log.

It happened again, independently, on the canonical deployment's own draw #1 — the migration itself
took longer than one 900-second draw window, so every participant's deposit again landed after close.
Same code path, same correct handling, a different deployment: [`evidence/live/draws/draw-1.json`](evidence/live/draws/draw-1.json).

---

## 12. Migrated to Zama's registered `cUSDCMock`, re-verified end to end

Serein's contracts were already written against generic `IERC7984`/`IERC7984ERC20Wrapper` — nothing in
`SereinPool`, `SereinPrizeReserve`, or `MockPrizeSource` assumes the confidential token is one Serein
deployed itself. That claim is now backed by more than the source: the canonical deployment runs
directly on Zama's Sepolia `cUSDCMock`, resolved through the on-chain
[Confidential Token Wrappers Registry](https://docs.zama.org/protocol/protocol-apps/confidential-tokens/wrapper-registry)
rather than a hardcoded address — `deploy-canonical.ts` calls `getConfidentialTokenAddress`, checks
`isValid`, and refuses to deploy against anything the registry doesn't itself vouch for.

Every property this document claims was re-proven against the new pair, not assumed to carry over:
wrap, confidential deposit, live-relayer encryption and user decryption, a full weighted draw with a
real winner, independent aggregate recomputation from on-chain timestamps, and all four confidentiality
refusals. See [DECISIONS.md](DECISIONS.md#zamas-registered-cusdcmock-not-a-serein-owned-token) for the
full reasoning and [`evidence/legacy-custom-token/`](evidence/legacy-custom-token/) for the earlier,
still fully-verified campaign that ran on Serein's own token pair before the migration.

---

## What is _not_ claimed

- No security audit.
- No mainnet deployment.
- No real yield. The prize source is a funded mock and is named as one.
- No claim that this "scales". Cost is linear, measured, and bounded — a pool of hundreds is
  operable, a pool of tens of thousands would need the compaction work in DECISIONS.md.
- No claim of anonymity. See [PRIVACY.md](PRIVACY.md) for the residual leaks.
- **Live draw count is still deliberately small.** Six live Sepolia draw lifecycles ran on the
  original Serein-owned token (one zero-weight, five non-zero, preserved under
  `evidence/legacy-custom-token/`), plus a fresh campaign on the canonical Zama-asset deployment.
  These are repeated production-path demonstrations, not evidence of user adoption or large-scale
  usage.
