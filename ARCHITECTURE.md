# Architecture

Serein is a savings pool that runs a prize draw. Balances are encrypted, the draw is exactly
weighted, and prize money cannot reach principal. This document explains how each of those holds,
including the proof that the draw is unbiased.

---

## 1. The shape of the problem

A prize savings pool needs three things at once:

1. **Weight proportional to contribution over time.** Otherwise the winning strategy is to deposit
   moments before the draw and withdraw moments after, at the expense of everyone who actually kept
   money in the pool.
2. **Selection that is exactly proportional to weight.** A draw with quiet bias is not a fair draw,
   and "approximately fair" is a phrase that should never appear in a financial product.
3. **Principal that cannot be spent on prizes.** Not as a policy, as a structure.

Doing all three while the balances are ciphertexts is the whole engineering problem. Each of the
three fights encryption in a different way, and the solutions are correspondingly different.

---

## 2. Encrypted time-weighted balances

### 2.1 The mechanism

Weight is the integral of balance over the draw epoch:

```
W_i = ∫ balance_i(t) dt   over [epochStart, epochEnd]
```

Computed the way PoolTogether computes it: keep a running cumulative of balance-seconds, and the
weight across any interval is the difference of the cumulative at its two endpoints.

Each participant has an append-only series of observations:

```solidity
struct Observation {
    uint64   timestamp;    // public
    euint64  balance;      // encrypted
    euint128 cumulative;   // encrypted
}
```

On a balance change at time `t`:

```
cumulative_new = cumulative_last + balance_last × (t − timestamp_last)
```

And the cumulative at an arbitrary point:

```
cumulativeAt(t) = obs.cumulative + obs.balance × (t − obs.timestamp)
```

where `obs` is the latest observation at or before `t`.

### 2.2 Why this works under encryption

The construction survives encryption because of one asymmetry: **the time axis stays public.**

- `timestamp` is plaintext, so observations can be **binary-searched**. This is the load-bearing
  part. FHE cannot branch on a hidden condition, so if timestamps were encrypted the lookup would be
  impossible — you would have to scan every observation homomorphically, and the cost would be
  unbounded.
- The extrapolation multiplier `(t − obs.timestamp)` is plaintext, so the multiply is a **scalar**
  operation rather than ciphertext-by-ciphertext. Measured, that is 696,000 HCU instead of
  substantially more.
- Only `balance` and `cumulative` are ever ciphertexts.

Nothing about *when* someone acted is hidden. That was never hideable — it is visible from the
transaction itself. What is hidden is *how much*, which is the part that matters.

### 2.3 Same-block writes

Two writes in the same block collapse into one observation, overwriting the balance in place. Without
that rule the series would contain a zero-length segment whose balance shadows the earlier one during
lookup, and `cumulativeAt` would stop being well defined at a boundary several transactions share.
Because the collapsed segment has zero length it contributes nothing to the integral, so the
overwrite is exact rather than approximate.

### 2.4 Why withdrawal during a draw is safe

`weightBetween(start, end)` reads two frozen historical points. A balance change after `end` moves
neither of them. This is what lets Serein keep withdrawals open at every stage of a draw — closed,
proof outstanding, mid-selection, keepers offline — without letting anyone alter the entry they
already have, or anyone else's.

The live campaign checks this directly: withdrawals are performed at three separate draw stages and
the consistency proof still passes.

### 2.5 Append-only, and why

PoolTogether overwrites observations within a period using a ring buffer. Doing that correctly needs
a period-alignment argument that has to hold against every draw boundary, and getting it subtly wrong
corrupts weights *silently* rather than reverting.

Serein appends. Lookups are O(log n) by binary search over public timestamps, no draw operation ever
scans a series linearly, and the growth cost is documented in BENCHMARKS.md rather than hidden. The
production compaction path is described in DECISIONS.md.

### 2.6 The aggregate identity

The pool maintains a global series alongside the individual ones, written at the same timestamp on
every balance change. That gives:

```
aggregate.weightBetween(s, e) = Σ_i users[i].weightBetween(s, e)
```

The aggregate balance function is the pointwise sum of the individual balance functions, and
integration is linear. Every write to a user series is paired with a write to the aggregate series at
the same instant, so the identity holds exactly.

This identity is why publishing **one** aggregate is enough to run an exact draw without publishing
anything individual.

---

## 3. Exact weighted selection

### 3.1 The constraint

The coprocessor generates bounded randomness only with a **power-of-two** upper bound:

```solidity
FHE.randEuint128(uint128 upperBound)   // upperBound must be a power of two
```

A pool's total weight is essentially never a power of two.

### 3.2 What Serein does not do

The tempting shortcut is to score each participant as `balance_i × random_i` and take the argmax.
This does **not** produce `W_i / ΣW`. It produces whatever distribution the product of a weight and
a uniform variate happens to induce — which favours large savers differently than advertised, in a
way that is hard to notice and impossible to defend. Serein does not use it.

### 3.3 Rejection sampling

Publish the frozen aggregate `T`, derive the bound publicly, and sample:

```
B = nextPowerOfTwo(T)          so that  T ≤ B < 2T
r ~ Uniform{0, …, B−1}
accept iff r < T
```

**Claim.** Conditioned on acceptance, `r` is uniform on `{0, …, T−1}`.

**Proof.** For any `x ∈ [0, T)`:

```
P(r = x | r < T) = P(r = x ∧ r < T) / P(r < T)
                 = P(r = x) / P(r < T)
                 = (1/B) / (T/B)
                 = 1/T
```

The second equality holds because `x < T`, so the event `r = x` implies `r < T`. The result is
independent of `x`, so the conditional distribution is uniform. ∎

**Rejection leaks nothing about the eventual outcome.** A rejected candidate reveals only that it
was ≥ T. That event is independent of which value below `T` a *fresh* draw will produce, because
each candidate is drawn independently. So restarting preserves uniformity exactly, and the public
attempt counter discloses nothing beyond an operational fact already visible in the transcript.

**Termination.** Since `B < 2T`, acceptance probability is `T/B > 1/2`. The number of attempts is
geometric with mean `B/T < 2`, and `P(no acceptance in n attempts) < 2^−n`.

Measured on the reference model across 200,000 samples per vector, mean attempts match `B/T` to four
decimal places — e.g. `T = 10, B = 16` predicts 1.6, observed 1.6003.

### 3.4 Interval selection

With `r` uniform on `[0, T)`, walk the participant registry in its public order accumulating an
encrypted prefix `P`:

```
start_i   = P
end_i     = P + W_i
winner_i  = (r ≥ start_i) ∧ (r < end_i)
P         = end_i
```

The intervals `[P_i, P_i + W_i)` are half-open and consecutive, so they **partition** `[0, P_final)`
with no gaps and no overlap. Since `r < T` and `P_final = T`, exactly one participant matches, and

```
P(winner = i) = |[P_i, P_i + W_i)| / T = W_i / T
```

which is the advertised probability, exactly.

**Zero-weight exclusion is structural.** A participant with `W_i = 0` owns the empty interval
`[P, P)`, which no point can lie inside. They are not unlikely to win; they are unable to.

### 3.5 The consistency gate

At the end of the walk the contract checks `P_final == T` under encryption and publishes only that
boolean. The walk accumulates each participant's weight exactly once, so the final prefix must equal
the aggregate the KMS already proved. A mismatch would mean the aggregate series and the individual
series disagree — a bug, not an operational condition — and the draw is blocked from finalizing.

This is a **detection** gate, not a payment gate. Payment safety comes from the partition property
above: at most one participant can match whatever `P_final` turns out to be. If `P_final < T`, `r`
may land in `[P_final, T)` and nobody wins; the prize simply stays in the reserve. Either way there
is no path to a double payout.

---

## 4. Structural no-loss

Two contracts, no path between them:

```
saver ──deposit──▶ SereinPool ──withdraw──▶ saver
                       │
                       │ encrypted winner predicate (ebool)
                       ▼
funder ──fund──▶ SereinPrizeReserve ──claim──▶ winner
```

- `SereinPool` holds principal. It has **no owner**, no admin function, no upgrade path, and no
  function that spends prize funds.
- `SereinPrizeReserve` holds prize money and no principal. It cannot reach the pool's balances.
- The only thing crossing is an encrypted boolean per participant — a value the pool computes but
  cannot itself read.

Prize conservation is structural rather than checked: the selection walk produces at most one true
predicate per draw, every other participant's credit is `select(false, prize, 0)` — an encrypted
zero — so the reserve can pay out at most the prize it was funded, in any claim order, including to
addresses that never participated.

Gas fees are not principal and are disclosed separately.

---

## 5. Arithmetic bounds

FHE addition does not revert on overflow. A sum exceeding the type's range wraps silently and
produces a ciphertext indistinguishable from a correct one. Correctness must come from a bound proved
*before* the operation.

The chain, in `libraries/Bounds.sol` and mirrored in `packages/reference-model/src/bounds.ts`:

| Quantity | Bound | Why it holds |
|---|---|---|
| Total principal | `2^60 − 1` | Enforced at the deposit callback; a breach returns encrypted `false` and the token refunds |
| Individual balance | `≤ total ≤ 2^60` | Follows from the above |
| `total + amount` pre-check | `< 2^64` | `2 × MAX_TOTAL_PRINCIPAL < 2^64`, so the intermediate cannot wrap |
| Cumulative observation | `2^60 × 2^32 = 2^92` | Fits `euint128` with 36 bits spare |
| Epoch weight `W_i` | `2^60 × 2^26 = 2^86` | Epoch capped at `MAX_EPOCH_SECONDS` |
| Aggregate `T` | `≤ 2^86` | Same quantity on the aggregate series |
| `nextPowerOfTwo(T)` | `≤ 2^87 < 2^128` | Never overflows the randomness type |
| Prefix `P` | `≤ T ≤ 2^86` | Monotone, terminates at `T` |

`MAX_ELAPSED_TOTAL` is `2^32` seconds (~136 years), so the cumulative bound holds for the life of the
contract rather than for a configured window.

The bound is enforced at the **single point where value enters**: the ERC-7984 receiver callback.
Returning encrypted `false` makes the token refund the sender, and the pool credits
`select(accepted, amount, 0)`, so a rejected deposit credits nothing and the refund is exact. The
alternative — silently clamping — would take someone's money and credit them less.

---

## 6. The draw state machine

Three steps depend on a value only the Zama KMS can produce, and a fourth is bounded by the HCU
ceiling. Each is an explicit state, which is what makes a draw resumable.

```
Open
  │ closeDraw()                    epoch elapsed; aggregate frozen and marked publicly decryptable
  ▼
AwaitingTotalProof
  │ submitTotalProof()             KMS-signed cleartext verified by FHE.checkSignatures
  ▼
AwaitingRandomCandidate ◀──────────┐
  │ generateRandomCandidate()      │
  ▼                                │ rejected: candidate erased, attempts += 1
AwaitingAcceptanceProof ───────────┘
  │ submitAcceptanceProof()  accepted: target locked, never publicly decryptable
  ▼
Selecting
  │ processSelectionBatch()        repeated until the cursor reaches the frozen participant count
  ▼
AwaitingConsistencyProof
  │ submitConsistencyProof()
  ▼
Finalized
```

A draw whose verified aggregate is **zero** — nobody held a balance during any part of the epoch —
goes straight from `AwaitingTotalProof` to `Finalized` with no winner. There is nothing to sample and
`nextPowerOfTwo(0)` is undefined. This path ran live on Sepolia in draw #1.

### 6.1 Properties

- **Monotonic**, with exactly one backward edge: the rejection loop.
- **Permissionless.** Every transition is callable by anyone. The keeper holds no privilege.
- **Replay-safe.** Resubmitting an accepted proof fails the status check.
- **Forgery-safe.** `FHE.checkSignatures` verifies the KMS signed *that value* for *that handle*, so
  a made-up number fails and a real number from another draw fails.
- **Idempotent batches.** A batch that reverts leaves the cursor unmoved, so retrying never
  double-processes anyone.
- **No admin liveness dependency.** If every keeper stops, savers still deposit and withdraw, and
  anyone can finish an in-flight draw from a browser.

### 6.2 Epoch continuity

The next epoch starts exactly where the previous one ended, so no interval of time is unaccounted
for. If a draw is closed long after its scheduled end, the next epoch is **stretched** to the first
boundary in the future rather than replaying every missed period — weight is an integral, so a longer
epoch is still exact, whereas replaying hundreds of tiny catch-up draws would not be operable.

---

## 7. Access control

Every persistent ciphertext handle has an explicit access plan.

| Handle | Contract | User | Public |
|---|---|---|---|
| Current principal | yes | owner only | never |
| TWAB observations (balance, cumulative) | yes | **no** | never |
| Aggregate weight, before close | yes | no | no |
| Aggregate weight, after close | yes | no | **yes, deliberately** |
| Random target | yes | no | **never** |
| Acceptance boolean | yes | no | yes |
| Consistency boolean | yes | no | yes |
| Winner predicate | pool + transient to reserve | no | never |
| Prize credit | reserve | owner only | never |

Historical observations are granted to the contract **and to nobody else, including their owner**.
Two cumulative points at known timestamps reconstruct the balance between them, so granting a user
access to their own history would hand any future coercer a clean audit trail.

Cross-contract access uses transient grants where a handle is needed for one call only. The winner
predicate crosses from pool to reserve transiently and is never persisted outside the reserve.

---

## 8. ERC-7984 integration

Deposits arrive through `confidentialTransferAndCall`, not through an operator approval. That matters
for more than convenience: an operator grant is a standing permission to move someone's confidential
tokens for as long as it lasts, and the deposit path does not need one.

The callback carries the amount that **actually** transferred after the token's own clamping, so the
pool credits what it received rather than what was requested.

Two ACL obligations on the receiver's return value, both discovered by reading OpenZeppelin's source
rather than the docs:

```solidity
FHE.allowThis(accepted);                    // ERC7984Utils requires isAllowed(retval, receiver)
FHE.allowTransient(accepted, msg.sender);   // the token consumes it in FHE.select
```

Omitting either reverts the transfer. The library checks the first explicitly; the second is needed
because `_transferAndCall` uses the boolean in a `select` executed in the token's context.

Withdrawals decrement accounting by the amount the token **reports as transferred**, not the amount
requested, so the pool's books cannot drift from its real confidential balance.

Unwrapping back to the public ERC-20 is asynchronous — it opens a request that completes only after
the KMS signs the cleartext amount. The app presents that as the two-step flow it is.

---

## 9. Frontend

```
browser
 ├─ wallet provider ......... signing and broadcasting (never proxied)
 ├─ Zama SDK (same-origin) .. encrypted inputs, user decryption
 └─ /api/rpc ................ read-only allowlisted proxy on the Worker
                                └─ Alchemy Sepolia (key stays server-side)
```

- The SDK is **vendored into `public/`** at build time. The public CDN older guides point at returns
  403 for every current version, and its one readable artifact is compiled against a relayer hostname
  that no longer resolves. Vendoring keeps the CSP at `script-src 'self' 'wasm-unsafe-eval'`.
- Single-threaded WASM by choice. Multi-threading needs cross-origin isolation, and
  `Cross-Origin-Embedder-Policy: require-corp` breaks wallet connectors — a bad trade for encrypting
  one 64-bit value.
- `/api/rpc` forwards **read methods only**. `eth_sendRawTransaction` is absent by design: wallets
  broadcast their own transactions, so relaying them would add a censorship point for no benefit.
- Revealed plaintext lives in memory in one tab. Not `localStorage`, not a cookie, never in a fetch
  body, never logged. Cleared on wallet change, chain change, and page unload.

---

## 10. What this design costs

Stated here rather than in a footnote:

- **Storage grows** with participants and with balance changes. Append-only observations are three
  slots each.
- **The selection walk grows** with participant count, at a measured 1,993,721 HCU each (2,963,378
  with a cold boundary cache). At the 20M per-transaction ceiling that is 8 and 6 per batch
  respectively. A pool of thousands would need the compaction path in DECISIONS.md.
- **The aggregate is a real disclosure.** With few savers it is a large one, and the app says so
  rather than describing a two-person pool as private.
- **The relayer is a shared public service.** It drops bodies under load. Serein retries with backoff
  rather than treating a transport failure as a protocol failure — but it is a dependency, and
  PRIVACY.md and SECURITY.md say so.
