# Serein — Product Requirements Document

**Version:** 1.0  
**Status:** Build-locked  
**Product type:** Confidential no-loss prize savings protocol  
**Target environment:** Ethereum Sepolia + Zama Protocol  
**Working product name:** **Serein**  
**Primary tagline:** **Private savings. Fair prizes.**  
**Secondary line:** Your savings stay private. Your chance to win stays mathematically fair.

---

## 0. Agent Handoff Contract

This PRD is intended to be handed directly to an autonomous coding agent together with `DESIGN.md`.

The implementation agent must treat:

1. this PRD as the product, architecture, correctness, security, evidence, and completion specification;
2. `DESIGN.md` as the visual-system and UI-art-direction authority;
3. current canonical Zama, OpenZeppelin, PoolTogether, Ethereum, Cloudflare, wagmi/viem, and framework documentation as the technical source of truth whenever package APIs or deployment details have changed.

The agent is expected to build the entire product end-to-end, not scaffold it and stop.

### 0.1 Non-negotiable operating rules

- Do not reduce scope because of elapsed time, deadline proximity, or perceived implementation effort.
- Scope may be changed only when a feature weakens correctness, confidentiality, security, judge legibility, sponsor relevance, product coherence, or has lower expected value than the complexity it introduces.
- Do not substitute mocks for a required live sponsor-critical path.
- Do not silently change the core mechanism.
- Do not invent technical capabilities that are not supported by the current Zama stack.
- Verify uncertain FHE behavior against current canonical documentation and/or source before coding around it.
- Build the intended full system first in architecture, then implement it incrementally.
- Do not stop because unit tests pass. Completion requires live Sepolia proof, production deployment, judge-ready UX, documentation, evidence, clean-room reproducibility, and every acceptance gate in this PRD.
- Do not use fake balances, fake draw history, placeholder metrics, fabricated activity, fake receipts, or mocked sponsor integrations in the deployed judge path.
- If a real external blocker is encountered, exhaust reasonable technical alternatives first. Ask the user only for information or account actions that cannot be generated locally, such as funding Sepolia ETH, an Alchemy URL, Cloudflare authentication, WalletConnect project ID, or explorer verification credentials.
- Never expose or commit a private key, mnemonic, API secret, or deployer secret.
- Never include `"Zama"` in the product name.
- Keep all claims honest. Testnet, local, simulated, benchmarked, and live evidence must remain clearly distinguished.
- The public repository must make sense to a reviewer who has never seen the development conversation.

### 0.2 Definition of done

The agent may call Serein complete only when all of the following are true:

- full onchain cycle works on Sepolia: acquire test token → shield/wrap → save → reveal private balance → close/progress draw → exact weighted winner selection → reveal result/winnings → claim → withdraw principal;
- individual balances, individual time-weighted draw weights, random target, winner predicate, and prize credit remain encrypted;
- the only intentional fairness-related public disclosure is the frozen aggregate draw weight and explicitly approved verification booleans;
- winner selection is mathematically exact, not an approximation;
- principal is structurally isolated from prize funds;
- withdrawals remain available while a draw is processing;
- draw execution is resumable and permissionless;
- user decryption uses the current EIP-712 Relayer SDK flow;
- all FHE access-control grants are explicitly reviewed;
- HCU usage is measured and batch sizes are justified;
- a live public web app is deployed to Cloudflare Workers;
- the deployed app is responsive, accessible, and works from first wallet connection without private developer knowledge;
- all required error and recovery states work;
- deterministic local tests, FHE mock tests, adversarial tests, end-to-end browser tests, and live Sepolia verification pass;
- a clean-room reproduction succeeds;
- contract source is publicly verifiable;
- raw evidence is committed under `evidence/`;
- README, architecture, security, privacy, setup, decisions, contributions, evidence, and demo documentation are complete;
- all public copy, addresses, screenshots, metrics, docs, and deployment state agree.

---

# 1. Product Summary

Serein is a consumer-grade confidential prize-savings protocol.

A user deposits a test ERC-20, converts it into an ERC-7984 confidential asset, and saves that asset in a shared pool. The user's savings balance stays encrypted onchain. Savings remain withdrawable as principal at any time. A separately funded prize reserve represents accrued yield. At the end of each draw epoch, Serein calculates each participant's **encrypted time-weighted balance**, then performs **exact deposit-weighted selection using encrypted Zama randomness**.

The core probability is:

```text
P(user i wins) = W_i / ΣW
```

where:

```text
W_i = ∫ balance_i(t) dt
```

over the draw epoch.

`W_i` never becomes plaintext.

Serein deliberately reveals only the final aggregate epoch weight `ΣW` when exact arbitrary weighted sampling requires a plaintext bound. Individual balances, individual weights, odds, the encrypted random target, winner identity during selection, and prize amounts remain private.

The consumer experience must feel like a modern savings account. FHE mechanics belong in a separate proof view for judges, auditors, and technical users.

---

# 2. Why This Product Exists

Public prize savings leaks financial position.

Without confidentiality, an observer can infer or directly read:

- how much a wallet has saved;
- changes in that savings position;
- a participant's approximate or exact prize odds;
- large savers worth targeting;
- who won;
- how much they won;
- behavioral patterns around saving and withdrawing.

Serein preserves the verifiable economic mechanism while minimizing position disclosure.

The product promise is simple:

> **Save privately. Keep your principal. Win with mathematically fair odds.**

---

# 3. Product Principles

## 3.1 Familiar product first

The primary category is **savings**.

Do not lead the consumer with:

- FHE;
- ciphertext;
- euint;
- ACL;
- CSPRNG;
- KMS;
- gateway;
- HCU.

Those terms belong in `/proof`, technical docs, tooltips, and architecture material.

## 3.2 Privacy must be specific

Never write vague claims such as:

- completely anonymous;
- everything is private;
- untraceable;
- fully trustless;
- impossible to hack.

Always state exactly what is encrypted, what is public, and why.

## 3.3 No-loss must be structural

Principal protection must not depend on an administrator behaving correctly.

Prize spending code must have no ability to spend principal.

Gas fees are not principal and must be disclosed separately.

## 3.4 Exact fairness over approximate cleverness

Do not use approximate schemes such as:

```text
score_i = balance_i × random_i
winner = argmax(score_i)
```

unless the mathematically exact mechanism in this PRD is proved impossible on the current canonical Zama stack and the user explicitly approves a redesign.

## 3.5 User freedom during draws

Users must not be globally frozen while a draw computes.

Deposits and withdrawals after a draw closes affect future epochs, not the already frozen epoch.

## 3.6 Recovery is a product feature

Interrupted draws must be resumable from onchain state.

A failed keeper, closed browser, rate-limited RPC, failed public-decryption submission, or reverted batch must not corrupt the draw or lock principal.

---

# 4. Primary Users

## 4.1 Saver

Wants to save confidentially and participate in recurring prizes without risking principal.

Needs:

- clear onboarding;
- test tokens;
- shield/wrap flow;
- private balance reveal;
- simple add-savings flow;
- clear current draw state;
- private result reveal;
- claim;
- withdrawal;
- confidence that principal is independent of prize operations.

## 4.2 Judge / reviewer

Needs to verify:

- sponsor-critical Zama use;
- exact weighted selection;
- confidentiality boundaries;
- live Sepolia execution;
- no-loss structure;
- error handling;
- code quality;
- production readiness;
- raw evidence and reproduction commands.

## 4.3 Keeper / public draw participant

Progresses a draw without special financial authority.

A keeper compromise must not grant the ability to:

- move principal;
- choose a winner;
- change user balances;
- decrypt private user state;
- alter prize size;
- skip users;
- finalize an inconsistent draw.

## 4.4 Prize funder

Funds the mock yield/prize reserve.

This role may be permissioned for the Sepolia demo source, but it cannot touch principal.

---

# 5. User-Facing Vocabulary

Use friendly language on the consumer surface.

| Technical concept | Consumer term |
|---|---|
| Deposit | Add savings |
| ERC-20 → ERC-7984 wrap | Make private |
| Confidential token | Private USDC / private test USDC |
| User decryption | Reveal |
| Ciphertext / handle | Private value |
| FHE draw | Private draw |
| Encrypted TWAB | Draw weight |
| Prize credit | Prize |
| Claim | Collect prize |
| Withdraw principal | Take out savings |
| Public decryption | Verified draw step |
| Keeper | Draw helper |
| Draw state machine | Draw progress |
| Proof dashboard | Proof view |

User copy must never show an undisclosed encrypted value as `0`.

Use:

```text
••••••
Private
Hidden until you reveal it
```

rather than a misleading numerical placeholder.

---

# 6. Consumer Journey

## 6.1 First visit

Landing hero:

**Private savings. Fair prizes.**

Subhead:

> Save private test USDC into a shared prize pool. Your balance and odds stay encrypted, your chance to win stays fair, and your saved principal remains withdrawable.

Primary CTA:

**Start saving**

Secondary CTA:

**See how fairness works**

## 6.2 Wallet onboarding

A compact four-step onboarding flow:

1. **Connect wallet**
2. **Get test USDC**
3. **Make it private**
4. **Add savings**

Each step has:

- one dominant action;
- current completion state;
- plain-English explanation;
- recovery action;
- explorer link after a transaction.

Do not force the user to read documentation before using the app.

## 6.3 Faucet

The app must provide either:

- an in-app faucet call to the selected Sepolia test ERC-20; or
- a direct, explicit acquisition flow if using a canonical Zama-provided mock.

The preferred experience is one button:

**Get test USDC**

Show:

- expected token;
- Sepolia network badge;
- transaction status;
- resulting public test-token balance.

Rate-limit or cap faucet minting per address if deploying our own faucet.

## 6.4 Make private

Flow:

```text
test ERC-20
→ approval when required
→ ERC-7984 wrapper
→ private token balance
```

Primary label:

**Make private**

Supporting copy:

> This converts test USDC into a confidential token. The later savings amount stays encrypted onchain.

Be honest that the public ERC-20 wrapping transaction can reveal the amount being wrapped.

## 6.5 Add savings

User enters an amount locally.

The plaintext amount must remain in the browser.

The client registers/encrypts the input with the current Zama Relayer SDK.

Use ERC-7984 `confidentialTransferAndCall` when supported by the selected token/wrapper so the pool receives the **actual transferred encrypted amount** in `IERC7984Receiver.onConfidentialTransferReceived`.

Success state:

> Added to private savings.

Do not render the amount publicly in activity history unless the user has explicitly revealed it for their own local session.

## 6.6 Home

Primary app screen:

```text
Your private savings
•••••• USDC
[ Reveal ]

Current draw
Draw #17
Ends in 01:24
Your draw weight: Private
Prize: Private

[ Add savings ] [ Take out savings ]
```

Supporting state:

- testnet badge;
- encrypted/private indicator;
- next draw countdown;
- current draw progress;
- most recent result;
- clear link to Proof View.

## 6.7 Reveal balance

Clicking **Reveal**:

1. retrieves authorized ciphertext handles;
2. creates the current Zama EIP-712 user-decryption request;
3. asks the connected wallet to sign;
4. calls Relayer SDK `userDecrypt`;
5. displays the plaintext only in the browser.

Default plaintext persistence:

- memory/session only;
- clear on wallet change;
- clear on network change;
- clear when the browser session ends;
- never send the plaintext to a backend;
- never log it.

Explain the permission in friendly terms:

> This signature lets this wallet read your Serein private values for a limited period. It does not move funds.

## 6.8 Take out savings

If the balance is currently revealed, validate requested amount client-side before submitting.

At contract level, never depend on plaintext validation. Compute the actual withdrawal safely under FHE.

Principal withdrawal must remain available even when:

- a draw has closed;
- aggregate decryption is waiting;
- random acceptance is waiting;
- selection batches are processing;
- keeper automation is offline.

A withdrawal after draw close changes the next epoch but must not retroactively change the frozen draw.

## 6.9 Draw result

After finalization:

```text
Draw #17 completed

Your result
••••••
[ Reveal result ]
```

After user decryption:

Winner:

> You won 125.00 private USDC.

Non-winner:

> No prize this draw. Your savings are still intact.

Never use failure language for a non-winning draw.

## 6.10 Claim

Every participant is allowed to call the same claim function.

The function may transfer an encrypted zero for a non-winner and the encrypted prize for the winner.

This reduces the amount of information revealed merely by claim success.

UI:

**Collect result**

After transaction, locally reveal resulting prize or private token balance if the user chooses.

## 6.11 Activity

Activity items show actions and states, not private values:

- Added savings
- Took out savings
- Draw #17 entered
- Draw #17 completed
- Result collected
- Private balance revealed locally

Each onchain action links to Sepolia explorer.

Private values remain `••••••` unless revealed in the current local session.

---

# 7. Information-Leakage Contract

This table is mandatory in the app and `PRIVACY.md`.

| Information | Public? | Rationale |
|---|---:|---|
| Wallet interacted with Serein | Yes | Public-chain transaction metadata |
| Participant address | Yes | Participant registry is public |
| Exact individual savings amount | No | ERC-7984 / encrypted accounting |
| Current individual principal | No | `euint64` |
| Individual historical balance | No | Encrypted TWAB observations |
| Individual draw weight | No | `euint128` |
| Individual odds | No | Derived from encrypted individual weight |
| Number of registered participants | Yes | Operational state |
| Draw timestamps/state | Yes | Liveness and verification |
| Frozen aggregate epoch weight | **Yes, intentionally** | Required for exact arbitrary weighted sampling |
| Random candidate | No | Encrypted CSPRNG output |
| Whether a candidate was accepted | Yes | Public verification boolean only |
| Number of rejection attempts | Yes | Operational transcript |
| Winner predicate | No | Encrypted boolean per participant |
| Winner identity during selection | No | Never publicly decrypted |
| Prize credit | No | Encrypted |
| Claim transaction caller | Yes | Public-chain metadata |
| Claimed amount | No | Confidential transfer |
| Withdrawal transaction caller | Yes | Public-chain metadata |
| Withdrawn confidential amount | No at confidential layer | Encrypted transfer |
| ERC-20 amount wrapped/unwrapped | Potentially yes | Transparent-token boundary |
| User-decrypted value | Only to authorized user | EIP-712 + ACL + Relayer SDK |

### 7.1 Aggregate privacy caveat

The aggregate epoch weight can leak information in a very small cohort.

Examples:

- one participant: aggregate fully reveals that participant's weight;
- two participants: either participant can subtract their own known weight to infer the other's.

The product must not hide this.

UI must display a privacy note for small cohorts.

Do not claim a strong anonymity set when one does not exist.

---

# 8. Core Economic Model

## 8.1 Principal

Principal is the confidential token amount a saver adds to Serein.

Principal:

- belongs to the saver;
- is tracked under encrypted accounting;
- is never used to fund a prize;
- can be withdrawn;
- is held by `SereinPool`.

## 8.2 Prize funds

Prize funds represent mock yield on Sepolia.

Prize funds:

- live in a separate `SereinPrizeReserve`;
- are funded independently from principal;
- may be confidential;
- are allocated to a draw;
- can never cause a principal transfer.

## 8.3 Yield abstraction

Define an interface such as:

```solidity
interface IPrizeSource {
    function fundDraw(uint256 drawId, ...) external;
}
```

Live Sepolia implementation:

`MockPrizeSource`

Production design:

`IPrizeSource` must permit a future adapter to a real confidential-yield source without changing principal accounting or the draw algorithm.

Do not invent a fake Morpho/Aave integration. If a real current Zama confidential-yield route is genuinely composable, implement and test a real adapter. Otherwise document the production seam honestly.

## 8.4 No-loss definition

User-facing:

> Your saved principal is never spent on prizes and remains withdrawable. Network gas fees still apply.

Technical:

For each user `u`:

```text
principal_before_draw(u) = principal_after_draw(u)
```

unless the user independently deposits or withdraws.

System-level:

```text
Σ principal accounting == confidential principal assets held by SereinPool
```

subject only to explicitly documented ERC-7984 transfer semantics.

Prize liabilities must be satisfied only from `SereinPrizeReserve`.

---

# 9. Encrypted Time-Weighted Balance

PoolTogether uses TWAB so users can enter and exit freely while prize weight reflects how much liquidity they contributed over time.

Serein implements the same economic idea with encrypted balances.

## 9.1 Per-user observation

Store observations containing:

```solidity
struct EncryptedObservation {
    uint64 timestamp;
    euint64 balance;
    euint128 cumulative;
}
```

Conceptually:

```text
cumulative_now
=
cumulative_previous
+
balance_previous × (timestamp_now - timestamp_previous)
```

The timestamp and elapsed time are public.

The balance and cumulative value remain encrypted.

Use the smallest safe encrypted types and explicitly prove overflow bounds.

## 9.2 Current encrypted balance

Store:

```text
principalBalance[user] : euint64
```

Every update must maintain:

- contract ACL persistence;
- user ACL to their own current balance;
- no ACL to another user.

## 9.3 Historical lookup

For a target timestamp `t`, find the most recent public-timestamped observation at or before `t`.

Compute:

```text
cumulativeAt(t)
=
observation.cumulative
+
observation.balance × (t - observation.timestamp)
```

under FHE.

## 9.4 Epoch weight

For draw epoch `[start, end]`:

```text
W_i
=
cumulativeAt_i(end)
-
cumulativeAt_i(start)
```

`W_i` stays `euint128`.

This lets a user withdraw after `end` while the draw still uses the frozen historical epoch.

## 9.5 Aggregate observation

Maintain a global encrypted total principal balance and global cumulative observation series using the same method.

The frozen aggregate epoch weight is:

```text
T
=
aggregateCumulativeAt(end)
-
aggregateCumulativeAt(start)
```

where `T` is initially encrypted.

## 9.6 Draw-epoch alignment

Draw epochs must be explicit onchain:

```text
draw.startTimestamp
draw.endTimestamp
```

A draw may only close after its scheduled end.

The next draw begins from a deterministic boundary.

No administrator may arbitrarily alter an already-open draw's historical interval.

## 9.7 Observation storage

Favor correctness first.

Every balance-changing action must preserve enough historical encrypted state to reconstruct draw boundaries exactly.

Do not implement PoolTogether-style observation overwriting unless the period alignment and correctness proof are explicit.

An append-only encrypted observation history is acceptable for the Sepolia product if:

- lookups are bounded/binary-searched by public timestamp;
- no draw operation linearly scans a user's entire history;
- storage-growth implications are documented;
- a clear production compaction/ring-buffer path is documented.

---

# 10. Exact Weighted Encrypted Randomness

This is the central technical mechanism.

## 10.1 Constraint

Current Zama bounded encrypted randomness accepts a plaintext upper bound and the documented upper bound must be a power of two.

Therefore arbitrary `T` cannot generally be passed directly as the bound.

## 10.2 Public aggregate verification

At draw close:

1. compute encrypted `T = ΣW`;
2. persist it;
3. call `FHE.makePubliclyDecryptable(T)`;
4. an unprivileged relayer/keeper calls Relayer SDK `publicDecrypt`;
5. submit clear `T` + KMS proof onchain;
6. verify with `FHE.checkSignatures`;
7. persist verified public `T`.

Never accept a plaintext total without a valid Zama decryption proof bound to the expected ciphertext.

Public decryption permission is permanent, so only the intended aggregate handle may be marked public.

## 10.3 Next power of two

Compute publicly:

```text
B = nextPowerOfTwo(T)
```

Guard:

- `T > 0`;
- `T <= MAX_DRAW_WEIGHT`;
- next-power-of-two cannot overflow the selected integer type.

## 10.4 Encrypted rejection sampling

Generate:

```text
r = FHE.randEuint128(B)
```

Then:

```text
accepted = FHE.lt(r, T)
```

`r` remains encrypted.

Make only `accepted` publicly decryptable.

A keeper obtains a proof and submits it.

If `accepted == false`:

- persist rejected-attempt status;
- generate a fresh candidate in a new transaction;
- never reuse a rejected candidate.

If `accepted == true`:

- lock this candidate as the draw's immutable random target;
- never make `r` publicly decryptable.

### Mathematical requirement

Given uniform `r` on `[0, B)` and conditioning on `r < T`:

```text
P(r = x | r < T) = 1 / T
```

for every `x` in `[0, T)`.

This produces exact uniform sampling over an arbitrary verified total.

A written proof must exist in `ARCHITECTURE.md`.

## 10.5 Individual selection

Process participants in deterministic public registry order.

Maintain encrypted prefix `P`.

For participant `i`:

```text
start = P
end   = P + W_i

winner_i =
    (r >= start)
    AND
    (r < end)

P = end
```

All values except registry position stay encrypted.

Exactly one positive-weight participant should satisfy the predicate.

Zero-weight participants must never win.

## 10.6 Selection consistency

At the end of processing:

```text
P == T
```

must hold.

Create an encrypted equality predicate and publicly verify only the boolean result through the same KMS-proof process.

A draw cannot finalize unless consistency is verified true.

## 10.7 Prize credit

For each participant:

```text
credit_i = FHE.select(winner_i, encryptedPrize, encryptedZero)
```

`credit_i` is passed or granted transiently to the prize reserve.

Never publicly reveal `winner_i`.

Never publicly reveal `credit_i`.

---

# 11. Draw State Machine

Use an explicit enum.

Recommended states:

```text
OPEN
CLOSED
TOTAL_PUBLIC_REQUESTED
TOTAL_VERIFIED
RANDOM_GENERATED
RANDOM_ACCEPTANCE_PUBLIC_REQUESTED
RANDOM_REJECTED
RANDOM_ACCEPTED
SELECTION_PROCESSING
CONSISTENCY_PUBLIC_REQUESTED
CONSISTENCY_VERIFIED
PRIZE_CREDITING
FINALIZED
```

Exact naming may vary, but every asynchronous boundary must be represented.

## 11.1 Required properties

- monotonic transitions;
- settle-once/finalize-once;
- replay-safe public-decryption submissions;
- idempotent batch processing;
- no skipped participant range;
- no overlapping processed range;
- stored selection cursor;
- stored prize-credit cursor if separate;
- explicit rejection-attempt counter;
- immutable epoch boundaries after close;
- immutable verified aggregate after verification;
- immutable accepted random target;
- no administrator-only liveness dependency.

## 11.2 Permissionless progress

Any address may call safe progression functions.

Examples:

```text
closeEligibleDraw()
submitTotalDecryption(...)
generateRandomCandidate()
submitAcceptanceDecryption(...)
processSelectionBatch(...)
submitConsistencyDecryption(...)
processPrizeBatch(...)
finalizeDraw()
```

If a stage requires an offchain Relayer SDK call, any client with the ciphertext handle may perform it because only explicitly public handles are involved.

## 11.3 HCU batching

Never iterate over an unbounded participant list in one transaction.

Determine safe batch sizes empirically.

Store measured:

- HCU global cost;
- HCU depth;
- EVM gas;
- participant count;
- operation mix.

Provide configurable or constant batch size with justified headroom below protocol limits.

A failed batch transaction must leave the cursor unchanged.

## 11.4 Withdrawal during draw

The selection algorithm must read historical TWAB state at frozen timestamps.

Therefore current balance changes after draw close cannot mutate the closed draw's `W_i`.

This is a critical invariant and must be tested live.

---

# 12. Contract Architecture

Recommended structure:

```text
contracts/
  SereinPool.sol
  SereinPrizeReserve.sol
  MockPrizeSource.sol
  interfaces/
    ISereinPool.sol
    ISereinPrizeReserve.sol
    IPrizeSource.sol
  libraries/
    EncryptedTWAB.sol
    ExactWeightedRandom.sol
    DrawState.sol
  test/
    MockUSDC.sol                  # only if a canonical faucet token is unsuitable
    TestConfidentialWrapper.sol  # only if required
```

## 12.1 `SereinPool`

Responsibilities:

- receive confidential principal;
- register participant addresses;
- maintain encrypted current principal balances;
- maintain user encrypted TWAB observations;
- maintain global encrypted TWAB observations;
- manage draw epochs;
- manage public aggregate proof flow;
- generate encrypted random candidates;
- verify acceptance booleans;
- process encrypted selection in batches;
- expose only the minimum handles required by user decryption/proof view;
- create winner predicates;
- coordinate transient prize-reserve access;
- withdraw principal.

Must not:

- own prize-source authority;
- spend prize funds;
- publicly decrypt individual balances or weights;
- allow admin winner selection.

## 12.2 `SereinPrizeReserve`

Responsibilities:

- receive confidential prize funding;
- bind encrypted prize allocation to draw ID;
- accept authorized encrypted winner predicates/credits;
- maintain encrypted per-user winnings;
- permit users to decrypt only their own winnings;
- process claims;
- preserve prize-conservation invariants.

Must not:

- hold user principal;
- access individual TWAB history;
- choose winners;
- modify draw history.

## 12.3 `MockPrizeSource`

Responsibilities:

- create the Sepolia mock-yield/prize funding path;
- fund `SereinPrizeReserve`;
- provide clear admin operations and events;
- make it impossible to touch `SereinPool` principal.

README must explain exactly how it works.

## 12.4 `EncryptedTWAB` library

Should be designed as a reusable primitive.

Responsibilities:

- append/update observation;
- compute cumulative at timestamp;
- compute weight between timestamps;
- validate timestamp ordering;
- expose public metadata without exposing encrypted values.

This is a strong candidate for ecosystem residue and an upstream example/library contribution.

## 12.5 `ExactWeightedRandom` library

Responsibilities:

- next-power-of-two calculation;
- draw bound validation;
- encrypted random generation;
- acceptance predicate construction;
- interval winner predicate construction.

Keep public-decryption orchestration in the parent contract if that keeps library responsibilities pure.

---

# 13. ERC-7984 Integration

Prefer the current OpenZeppelin confidential-contract implementation and the canonical Zama-compatible wrapper path.

At implementation time:

1. inspect the live Sepolia Confidential Token Wrappers Registry;
2. identify the current official test-token pair suitable for the judge flow;
3. verify faucet/mint accessibility;
4. use the official pair if it provides a stable full flow;
5. only deploy a project-local mock ERC-20/wrapper pair when the official pair cannot provide the required judge experience.

The app must remain compatible with ERC-7984 rather than hardcoding one bespoke token forever.

## 13.1 Callback deposit

Use `confidentialTransferAndCall` where supported.

The pool must implement `IERC7984Receiver`.

The callback receives the actual transferred encrypted amount.

Respect the OpenZeppelin receiver contract:

- return an initialized `ebool`;
- grant the calling token ACL access to that return handle;
- do not manually refund and also return false;
- test best-effort refund semantics;
- pin a current compatible OpenZeppelin release;
- specifically test receiver ACL behavior.

## 13.2 Operator approvals

Avoid requiring long-lived operator permission for the normal deposit path when callback transfers remove that need.

If any operator flow exists:

- default to short expiry;
- show active operator + expiry;
- provide one-tap revoke;
- explain that an active operator can move confidential tokens during its permission window.

---

# 14. ACL Discipline

Every persistent encrypted handle must have an explicit access plan.

## 14.1 Principal

Current principal:

```text
FHE.allowThis(handle)
FHE.allow(handle, user)
```

No other user receives access.

## 14.2 Historical observations

Contract access only unless a concrete UX requirement justifies user access.

Do not grant historical TWAB internals to users by default.

## 14.3 Aggregate draw weight

Contract access while encrypted.

Only the frozen aggregate handle is intentionally:

```text
FHE.makePubliclyDecryptable(handle)
```

after draw close.

## 14.4 Random target

Contract access only.

Never public.

Never user-decryptable.

## 14.5 Acceptance and consistency booleans

May be publicly decryptable when they reveal only the approved verification statement.

## 14.6 Winner predicate

Pool contract + transient prize-reserve access only.

Never public.

## 14.7 Winnings

Prize reserve + owning user.

Use current recommended ACL calls.

## 14.8 Cross-contract grants

Prefer transient permission when a handle is needed only during one call/transaction.

Persistent grants must be justified in `SECURITY.md`.

---

# 15. Arithmetic Safety

FHE arithmetic does not have ordinary Solidity revert semantics.

Every encrypted arithmetic path needs explicit bounds.

At minimum:

- principal balance upper bound;
- aggregate balance upper bound;
- elapsed time bound;
- cumulative `euint128` bound;
- draw total weight bound;
- prefix-sum bound;
- prize bound;
- addition/subtraction behavior;
- zero/uninitialized handle behavior.

Prefer current OpenZeppelin FHE-safe math helpers where appropriate.

Document all numeric ranges.

Add tests at:

- zero;
- one;
- max-1;
- max;
- overflow boundary;
- large elapsed interval;
- repeated deposits;
- full withdrawal;
- over-withdraw request.

---

# 16. Mock Yield and Prize Funding

The Sepolia product must contain a working yield/prize source, not a roadmap sentence.

Recommended flow:

```text
funder holds private test token
→ confidentially funds MockPrizeSource / PrizeReserve
→ amount assigned to draw
→ draw uses encrypted prize handle
→ winner credit computed encrypted
```

If funding starts from transparent test USDC, document that the initial wrap amount may be public.

UI:

```text
Prize reserve
Private
Funded for Draw #17
```

Avoid fake APY.

Do not display an APY unless a real measured yield source exists.

---

# 17. Keeper and Automation

Draws must be permissionless even if a keeper automates them.

## 17.1 Keeper authority

The keeper key has zero special financial privilege.

A compromised keeper may:

- spend its own Sepolia ETH;
- call permissionless state-progression functions.

It must not:

- transfer principal;
- transfer arbitrary prizes;
- select a participant;
- decrypt private values;
- alter epoch boundaries;
- bypass proof verification.

## 17.2 Automation target

Preferred:

- a Cloudflare scheduled Worker or route integrated with the deployed application;
- viem for transaction signing;
- current Zama Relayer SDK for public-decryption calls if compatible with Workers.

The implementation agent must test the Relayer SDK in the actual `workerd` preview runtime before assuming compatibility.

If the current SDK cannot run safely in Workers:

- preserve permissionless browser progression;
- implement a small separate Node keeper only if actually needed;
- ask the user for hosting credentials only if no existing deployment path can support it.

## 17.3 Draw schedule

Sepolia live deployment should use a short, regular interval appropriate for interactive testing.

The interval must remain a real onchain scheduling rule, not a frontend timer.

The UI must always read canonical draw timestamps from the contract.

A documented production configuration may use a longer period.

---

# 18. Frontend Architecture

Recommended:

```text
Next.js App Router
React
TypeScript strict mode
wagmi
viem
RainbowKit or an equally strong wallet layer
@zama-fhe/relayer-sdk
TanStack Query where useful
Tailwind CSS v4 or equivalent tokenized CSS
Cloudflare OpenNext adapter
```

Use package versions that are currently compatible rather than blindly copying stale version numbers.

## 18.1 Monorepo

Recommended structure:

```text
apps/
  web/
packages/
  contracts/
  protocol-sdk/
  reference-model/
  test-utils/
docs/
evidence/
scripts/
```

A simpler root layout is acceptable if it improves legibility without losing separation.

## 18.2 Chain source of truth

Public product state must come from Sepolia.

Do not maintain fake duplicate state in a database.

Use Alchemy for:

- reliable Sepolia JSON-RPC;
- historical log queries;
- transaction receipts;
- indexed activity reads.

Keep the Alchemy RPC URL server-side where practical.

Do not expose a secret API key merely for convenience.

For public/browser reads, use:

- wallet provider;
- safe public transport;
- or a narrow Cloudflare server route/proxy.

No Supabase/Postgres is required unless a real product need appears.

## 18.3 Event indexing

For the current scale:

- query contract logs through the Alchemy RPC;
- paginate;
- cache public responses at the Cloudflare layer when safe;
- invalidate/refetch after writes.

Do not create an indexer database solely to make the architecture diagram larger.

---

# 19. Routes and Information Architecture

## Marketing

### `/`
Landing page.

Sections:

1. Hero
2. Why private savings
3. How Serein works
4. No-loss by construction
5. Exact fairness
6. Privacy ledger
7. Product preview / live draw proof
8. Final CTA
9. Footer with docs, GitHub, contracts, testnet disclaimer

## Product

### `/app`
Primary savings home.

### `/app/save`
Faucet → make private → add savings.

### `/app/withdraw`
Reveal/validate → take out savings.

### `/app/draws`
Draw history.

### `/app/draws/[drawId]`
Consumer draw detail.

### `/app/activity`
Wallet-specific public activity with values hidden unless locally revealed.

## Judge / technical

### `/proof`
High-level protocol proof dashboard.

### `/proof/draws/[drawId]`
Full draw transcript.

### `/docs/how-it-works`
Friendly explanation.

### `/docs/privacy`
Exact leakage ledger.

### `/docs/security`
Threat model summary + link to repository.

### `/docs/contracts`
Live addresses, ABIs, explorer links, deployment commit.

---

# 20. Proof View

This is a major judge surface.

Example:

```text
Draw #17                                  FINALIZED

Participants                             42
Individual balances                      ENCRYPTED
Individual draw weights                  ENCRYPTED
Aggregate draw weight                    18,492,108,223
Aggregate proof                          VERIFIED
Random target                            ENCRYPTED
Random attempts                          2
Accepted candidate                       VERIFIED
Selection progress                       42 / 42
Prefix == aggregate                      VERIFIED
Winner                                   ENCRYPTED
Prize                                    ENCRYPTED
Principal spent on prizes                0

[ Explorer ] [ Raw evidence ] [ Reproduce ]
```

Each proof item should explain:

- what is public;
- what remains encrypted;
- which transaction proves it;
- which KMS proof is associated;
- which source file implements it.

The proof view must never decrypt individual data to make the demo easier.

---

# 21. UX and Visual Design

`DESIGN.md` is authoritative.

The product must translate its Aave-derived visual principles into an original Serein interface rather than copying Aave layouts verbatim.

## 21.1 Design tokens

Use the provided system:

- single chromatic accent: `#998eff`;
- light canvas: `#ffffff`;
- warm secondary surface: `#f6f7f4`;
- primary dark surface: `#221d1d`;
- deepest surface: `#0f0f10`;
- muted text: `#636161`;
- borders: `#bcbbbb`;
- 8px spacing base;
- 20px default cards/inputs;
- full-pill filled CTAs;
- minimal/no elevation;
- narrow font-weight range;
- strong hierarchy through size and tracking.

Use Inter or General Sans as the safe substitute if the custom Aave font is unavailable.

Do not copy or ship Aave proprietary font assets.

## 21.2 Dual-surface architecture

Marketing begins light.

The product/proof section hard-cuts into the dark surface.

Violet is the bridge.

Do not introduce a second decorative accent color.

Success/error states may use accessible semantic indicators only where necessary, and must also use icons/text rather than color alone.

## 21.3 Typography

Target:

- display: up to 72px desktop, fluidly reduced mobile;
- headings: 32–40px;
- body: 14–18px;
- weights: 400–500;
- tight negative tracking for large headlines.

Avoid 600–900 weight unless accessibility forces a narrow exception.

## 21.4 Component behavior

- 20px cards and form fields;
- pill primary actions;
- no glassmorphism;
- no fake terminal components on consumer screens;
- no glowing chain graphics;
- no decorative 3D blockchain art;
- no meaningless stat-card grid;
- no excessive shadows;
- no filler dashboards.

Imagery should be product-surface driven:

- real UI previews;
- transaction/draw proof;
- mobile/app compositions;
- simple line icons.

## 21.5 Responsive requirements

Must be intentionally designed and tested at:

- 320px
- 360px
- 390px
- 430px
- 768px
- 1024px
- 1280px
- 1440px+

Requirements:

- no horizontal overflow;
- wallet flow usable one-handed on mobile;
- primary actions at least 44px touch height;
- transaction sheets become full-width or bottom sheets on mobile;
- tables convert to stacked proof rows/cards;
- hero type scales fluidly;
- app navigation becomes an intentional mobile navigation pattern, not a squeezed desktop sidebar;
- proof data remains readable on narrow screens;
- long addresses truncate with copy controls;
- modals do not exceed viewport;
- keyboard remains usable on mobile amount input;
- safe-area insets respected.

## 21.6 Accessibility

Meet WCAG 2.2 AA where practical.

Required:

- visible keyboard focus;
- logical tab order;
- semantic landmarks;
- form labels;
- accessible transaction status announcements;
- no color-only state;
- reduced-motion support;
- sufficient contrast;
- descriptive button labels;
- icon buttons with accessible names;
- screen-reader text for encrypted values;
- focus restoration after dialogs;
- no autoplaying distracting motion.

---

# 22. Interaction States

Every critical action needs:

- idle;
- hover/focus;
- wallet disconnected;
- wrong network;
- preparing encryption;
- waiting for signature;
- submitting transaction;
- transaction pending;
- confirmed;
- rejected by user;
- RPC error;
- relayer error;
- contract error;
- recoverable retry;
- final success.

Do not collapse every error into `"Something went wrong"`.

---

# 23. Required Error Handling

## Wallet/network

- no wallet;
- user rejects connection;
- wrong network;
- chain switch rejected;
- wallet changes mid-flow;
- account changes mid-flow.

## Token

- faucet limit;
- insufficient public test token;
- approval missing;
- wrap failure;
- unsupported/confidential-token mismatch;
- operator expired/revoked.

## FHE

- SDK initialization failure;
- encryption registration failure;
- ciphertext input proof failure;
- missing ACL;
- user-decryption denied;
- expired EIP-712 authorization;
- public-decryption service failure;
- invalid KMS proof;
- stale draw proof submission;
- uninitialized handle.

## Pool

- zero/invalid save request;
- over-withdraw request;
- draw not yet closable;
- draw already closed;
- total weight zero;
- rejected random candidate;
- invalid batch range;
- draw already finalized;
- prize reserve not funded;
- claim already consumed;
- non-winner encrypted zero claim.

## Infrastructure

- Alchemy rate limit;
- Cloudflare route failure;
- stale cached state;
- explorer unavailable.

Each recoverable error must show a concrete next action.

---

# 24. Security Model

Create `SECURITY.md` with attacker, assumption, defense, proof, and limitation.

Required threat categories:

## 24.1 Confidentiality

- unauthorized user decryption;
- ACL overgrant;
- accidental `makePubliclyDecryptable` on private values;
- cross-contract handle leakage;
- historical balance leakage;
- winner-predicate leakage;
- prize leakage;
- frontend logging of plaintext;
- server analytics collecting decrypted values.

## 24.2 FHE correctness

- overflow/wraparound;
- underflow;
- uninitialized ciphertexts;
- silent encrypted-condition behavior;
- handle misuse;
- handle-as-identity/state-key mistakes;
- unsupported encrypted type conversion;
- stale FHE config.

## 24.3 ERC-7984

- operator abuse;
- transfer clamp/actual amount mismatch;
- receiver callback ACL error;
- double refund;
- reentrancy through callback/transfer path;
- unsupported token behavior;
- wrapper invalidation.

## 24.4 Draw integrity

- admin winner selection;
- randomness reuse;
- rejected-candidate reuse;
- acceptance proof replay;
- forged total;
- forged acceptance result;
- forged consistency result;
- skipped participant;
- duplicate participant processing;
- cursor rollback;
- cursor overlap;
- double finalization;
- zero-weight winner;
- draw boundary mutation;
- post-close withdrawal changing historic weight.

## 24.5 Liveness

- keeper disappears;
- keeper compromised;
- public-decryption relayer unavailable;
- RPC unavailable;
- batch exceeds HCU;
- participant count grows;
- failed batch transaction;
- browser closes;
- chain reorg.

Principal withdrawals must remain independent of draw liveness.

## 24.6 Prize reserve

- underfunded prize;
- double credit;
- double claim;
- prize reserve draining;
- prize source touching principal.

## 24.7 Frontend

- wrong contract address;
- stale deployment config;
- XSS;
- malicious token metadata;
- CSP drift;
- RPC response poisoning;
- network confusion;
- unsupported wallet behavior.

---

# 25. Required Invariants

At minimum encode these as tests.

1. Only a user can decrypt their current principal.
2. Another user cannot decrypt that principal.
3. Historical individual TWAB state never becomes public.
4. Draw aggregate is public only after the frozen draw closes.
5. Random target is never publicly decryptable.
6. Accepted random target lies in `[0, T)`.
7. Rejected random target is never used for selection.
8. Each participant is processed at most once per draw.
9. Selection cursor is monotonic.
10. Final encrypted prefix corresponds to the verified aggregate.
11. Exactly one positive-weight participant receives a non-zero winner predicate.
12. Zero-weight participants cannot win.
13. `P(i wins) = W_i / T` under the algorithm.
14. User principal is unchanged by draw progression.
15. User principal is unchanged by another user's claim.
16. Prize funds cannot be taken from the principal pool.
17. Prize credit cannot exceed the assigned draw prize.
18. A draw cannot finalize twice.
19. A prize cannot be claimed twice.
20. A withdrawal after draw close does not alter the closed epoch weight.
21. A deposit after draw close does not alter the closed epoch weight.
22. A failed batch does not advance state.
23. An invalid KMS proof changes no draw state.
24. A stale/replayed proof changes no draw state.
25. A compromised keeper has no privileged fund-moving capability.
26. User decryption grants do not grant fund-moving authority.
27. No plaintext private amount is sent to backend logs or APIs.
28. Contract balance accounting remains consistent with actual confidential transfers.

---

# 26. Testing Strategy

Use deep proof and wide proof.

## 26.1 Deterministic unit tests

Cover every pure/public helper:

- nextPowerOfTwo;
- draw boundary math;
- epoch ID;
- batch range;
- state transitions;
- replay IDs;
- timestamp lookup;
- reference TWAB math;
- reference weighted-selection math.

## 26.2 FHE local/mock tests

Use current Zama-supported Hardhat mock mode.

Test:

- encrypted deposit;
- encrypted withdrawal;
- current balance ACL;
- cross-wallet decryption denial;
- observation updates;
- frozen historical weight;
- global aggregate;
- public decryption state preparation;
- random generation;
- rejection sampling;
- selection;
- prize credit;
- claim;
- arithmetic bounds.

## 26.3 Reference model

Create `packages/reference-model`.

Use deterministic `BigInt` plaintext math that mirrors:

- TWAB;
- aggregate;
- rejection sampling;
- prefix intervals;
- winner;
- prize conservation.

Generate seeded scenario sets.

The FHE mock result must match the reference model for equivalent controlled inputs.

## 26.4 Wide evidence

Target a large deterministic scenario corpus, e.g. **10,000+ generated scenarios**, because local model/FHE mock execution is cheap enough to make a strong parity claim.

Clearly label them:

> deterministic scenarios, not users.

Include:

- equal weights;
- 1:2;
- 1:2:7;
- whale + many small savers;
- late deposits;
- early withdrawals;
- zero weights;
- repeated balance changes;
- full exit;
- candidate rejection;
- multiple rejections;
- max bounds;
- participant count variation.

## 26.5 Statistical fairness

Supplement exact algorithm/reference proof with repeated controlled draws.

For chosen weight vectors, compare observed winner frequencies with expected probabilities.

Report confidence intervals and sample size.

Do not use the statistical test as the only proof of fairness.

## 26.6 Adversarial tests

Explicitly attempt:

- unauthorized decrypt;
- wrong-wallet decrypt;
- callback ACL failure;
- replayed public proof;
- proof for wrong handle;
- random reuse;
- duplicate batch;
- skipped batch;
- out-of-order batch;
- double finalize;
- double claim;
- over-withdraw;
- post-close deposit/withdraw;
- underfunded prize reserve;
- keeper interruption;
- HCU boundary;
- stale frontend config.

## 26.7 Browser E2E

Use Playwright.

At minimum:

- connect test wallet flow where feasible;
- network switching UI;
- faucet;
- wrap/shield;
- save;
- reveal;
- draw progress;
- reveal result;
- claim;
- withdraw;
- mobile viewport;
- desktop viewport;
- retry states;
- encrypted values never render as `0`.

Where wallet automation requires fixtures, keep judge-facing real wallet flow separately verified on live deployment.

## 26.8 Live Sepolia campaign

Run repeated end-to-end cycles with distinct ephemeral wallets.

Publish:

- addresses;
- transaction hashes;
- contract addresses;
- draw IDs;
- public totals;
- proof transaction hashes;
- encrypted handles where safe;
- locally decrypted controlled-wallet results;
- HCU;
- gas;
- failures/refusals;
- recovery runs.

Do not publish private keys.

Run enough live cycles to demonstrate repeated operation and multiple failure paths. Choose the final sample count based on evidence value and protocol cost, not deadline pressure.

---

# 27. HCU and Production Benchmarks

Create `BENCHMARKS.md` and raw CSV/JSON.

Measure:

- FHE operations per deposit;
- FHE operations per withdrawal;
- HCU per observation update;
- HCU per selection participant;
- global HCU per batch;
- depth per batch;
- EVM gas;
- tx count per draw;
- end-to-end draw latency;
- public-decryption round-trip latency;
- Alchemy request counts;
- retry behavior;
- participant-count scaling.

Determine safe production batch size with explicit headroom.

Do not claim `"scales"` without this data.

---

# 28. Deployment and Secrets

## 28.1 Deployment wallet

The coding agent should generate a fresh Sepolia-only deployer wallet locally.

Requirements:

- use a cryptographically secure wallet generator;
- store private key only in gitignored local secret material such as `.env`;
- print/show only the public deployer address when asking the user to fund it;
- never paste the private key into chat, documentation, logs, evidence, or commits;
- never reuse a personal wallet;
- never use the deployer as proof that independent users exist.

Generate separate ephemeral participant wallets for live proof.

After the deployer receives Sepolia ETH, it may fund the test wallets with small Sepolia ETH amounts.

## 28.2 Required user-provided resources

Ask only when actually needed:

- Sepolia ETH for the generated deployer address;
- Alchemy Sepolia RPC URL;
- Cloudflare/Wrangler login if the local CLI is not authenticated;
- WalletConnect project ID if needed for non-injected wallets;
- explorer verification API key if automatic verification cannot be performed through another supported route;
- custom domain credentials only if the user wants a custom domain.

## 28.3 Environment layout

Example:

```text
.env.example
SEPOLIA_RPC_URL=
DEPLOYER_PRIVATE_KEY=
ETHERSCAN_API_KEY=

apps/web/.env.example
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_POOL_ADDRESS=
NEXT_PUBLIC_PRIZE_RESERVE_ADDRESS=
NEXT_PUBLIC_CONFIDENTIAL_TOKEN_ADDRESS=
NEXT_PUBLIC_UNDERLYING_TOKEN_ADDRESS=
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

Do not put a secret Alchemy key in `NEXT_PUBLIC_*` unless it is intentionally restricted for browser use.

## 28.4 Web deployment

Deploy Next.js to **Cloudflare Workers** using the current `@opennextjs/cloudflare` adapter and Wrangler.

The agent must:

1. install current compatible OpenNext + Wrangler;
2. create/verify `wrangler.jsonc`;
3. enable required `nodejs_compat`;
4. set a current compatibility date;
5. use `npm/pnpm run preview` to test under `workerd`, not only Next.js dev;
6. configure required Worker secrets;
7. run `wrangler deploy` / project deploy script;
8. verify the public `workers.dev` or custom URL;
9. run E2E smoke tests against the deployed URL.

Cloudflare's current Next.js path supports App Router, route handlers, RSC, SSR, SSG, ISR, Server Actions, streaming, and OpenNext deployment.

## 28.5 Cloudflare observability

Enable Worker observability.

Logs must never include:

- plaintext decrypted balances;
- plaintext prize values;
- private keys;
- signatures beyond what is already public;
- full sensitive request bodies.

Wallet addresses should be minimized/redacted in operational logs when possible.

---

# 29. RPC and Indexing

Use the user-provided Alchemy Sepolia RPC for reliability and log indexing.

Preferred flow:

```text
browser
  ├─ wallet provider for user signing/writes
  ├─ Zama Relayer SDK for FHE input/decryption
  └─ Serein API for cached public protocol reads where useful

Cloudflare Worker
  └─ Alchemy Sepolia RPC
       ├─ eth_call
       ├─ getLogs
       ├─ receipts
       └─ block data
```

Do not make Alchemy a trust dependency for protocol correctness.

If Alchemy is unavailable:

- users must still be able to send transactions through their wallet;
- public reads should have a documented fallback where practical;
- stale UI must be labeled stale rather than fabricated.

---

# 30. Frontend Privacy

No backend receives:

- plaintext save amount after client encryption, except public ERC-20 wrap boundaries;
- decrypted principal;
- decrypted individual draw weight;
- decrypted prize;
- user-decryption private key;
- EIP-712-derived private material.

Do not send these to analytics.

No third-party analytics SDK is required.

If any analytics is added, it must be privacy-reviewed and disabled from financial-value events.

---

# 31. CSP and Browser Hardening

The Zama SDK uses browser/WASM resources.

Create a strict CSP based on the actual final dependency graph.

Requirements:

- no wildcard script origins;
- no unsafe-eval unless the current canonical Zama SDK absolutely requires it and the reason is documented;
- same-origin app assets where practical;
- exact relayer/CDN origins;
- wallet-connect origins only when required;
- clickjacking protection;
- MIME sniff protection;
- referrer policy;
- permissions policy;
- current COOP/COEP requirements if the selected Zama SDK build needs cross-origin isolation.

Test the deployed headers with the real reveal/encryption flow.

Do not ship a CSP that looks strict but breaks FHE at runtime.

---

# 32. Repo Quality

Root should normally contain:

```text
README.md
docs/internal/PRD.md
docs/internal/DESIGN.md
ARCHITECTURE.md
SECURITY.md
PRIVACY.md
docs/internal/CONTRIBUTIONS.md
DECISIONS.md
SETUP.md
EVIDENCE.md
BENCHMARKS.md
docs/internal/DEMO.md
LICENSE
.env.example
```

README top section must communicate:

```text
product + mechanism + observed proof
```

Example structure after measurements exist:

> Serein keeps savings and individual prize odds encrypted while executing exact weighted draws onchain with Zama FHE. Across X live Sepolia cycles and Y deterministic scenarios, principal conservation held and weighted-selection parity matched the reference model.

Only insert measured numbers once produced.

Do not lead with test counts.

---

# 33. Open-Source Contribution Layer

Inspect:

- `zama-ai/fhevm`;
- Zama Relayer SDK;
- `zama-ai/dapps`;
- OpenZeppelin confidential contracts;
- current ERC-7984 examples.

Look specifically for issues exposed by Serein's real integration:

- bounded randomness docs/ergonomics;
- exact weighted selection patterns;
- public-decryption replay guidance;
- receiver callback ACL;
- FHE TWAB/history;
- HCU estimation;
- user-decryption UX;
- Cloudflare/SSR packaging;
- cross-transaction handle permissioning.

Preferred residue:

```text
EncryptedTWAB
ExactWeightedRandom
HCU benchmark corpus
reference weighted-draw example
real bug fix / test / SDK improvement
```

Do not manufacture trivial contribution PRs.

Record discoveries and upstream links in `CONTRIBUTIONS.md`.

---

# 34. Design-Specific Landing Page

Follow `DESIGN.md`.

## 34.1 Hero, light

Light/lavender top.

Content:

```text
Serein

Private savings.
Fair prizes.

Save private test USDC into a shared pool.
Your balance and odds stay encrypted. Your principal stays yours.

[ Start saving ] [ See how fairness works ]
```

Hero visual must be the actual product UI in a polished device/app composition.

No generic crypto illustration.

## 34.2 Privacy problem

Clean light section.

Headline:

> Saving onchain shouldn't publish your balance.

Show a before/after conceptual product UI:

```text
Public savings
12,530.21 USDC
3.72% of pool

Serein
•••••• USDC
Draw weight: Private
```

Avoid fearmongering.

## 34.3 How it works

Three clear stages:

1. Make test USDC private
2. Save into Serein
3. Keep your principal, enter private draws

## 34.4 Hard cut to dark

Begin technical/product-proof band.

Headline:

> Fairness survives encryption.

Show an actual draw proof card/browser surface.

## 34.5 No-loss section

Visual diagram from real product components:

```text
Your principal → Principal Pool
Prize funding   → Prize Reserve
```

No prize arrow is allowed to originate from principal.

## 34.6 Privacy ledger

Show the exact public/private table in a visually restrained way.

## 34.7 Final CTA

White filled pill + ghost action on dark surface.

---

# 35. Product UI Layout

Desktop app:

- compact top navigation;
- max 1200px content;
- focused two-column layouts where useful;
- savings card is the dominant visual;
- draw progress secondary;
- proof link visible but not intrusive.

Mobile:

- top app identity + wallet;
- savings figure first;
- primary actions large;
- draw card below;
- bottom navigation or compact menu;
- proof view accessible without crowding the home screen.

Do not turn the app into a generic 12-card DeFi dashboard.

---

# 36. Motion

Use restrained motion:

- encrypted-value reveal wipe/fade;
- draw progress step transitions;
- button feedback;
- subtle number transitions after reveal.

No:

- constant glowing;
- floating particles;
- slot-machine effects;
- casino confetti;
- spinning roulette imagery.

If the user wins, acknowledge it elegantly without changing the product into gambling aesthetics.

Respect `prefers-reduced-motion`.

---

# 37. Draw Proof Narrative

A judge should be able to understand a draw in under a minute.

The app should communicate:

1. balances are encrypted;
2. time held matters;
3. one aggregate is verified publicly;
4. random target remains encrypted;
5. exact weighted intervals are evaluated under FHE;
6. the winner remains encrypted;
7. prize is credited confidentially;
8. principal remains untouched.

Use tooltips / expandable technical detail rather than dumping equations onto the consumer screen.

---

# 38. Admin / Operator Surface

Do not expose a generic admin dashboard to normal users.

A small `/ops` route may exist if protected or clearly separated for:

- mock prize funding;
- keeper status;
- deployment config;
- draw health;
- public progression tools.

Every privileged action must be explicit.

There must be no `"pick winner"` or equivalent authority.

---

# 39. Demo Engineering

Create `DEMO.md` for a real-person video, maximum three minutes.

The app must make this sequence reliable:

1. open public deployment;
2. connect Wallet A;
3. get test token;
4. make token private;
5. add private savings;
6. reveal Wallet A's balance;
7. show Wallet B/C balances cannot be read;
8. trigger/progress draw;
9. show aggregate verified while individual weights stay encrypted;
10. show exact randomness mechanism in proof view;
11. reveal winner's private result;
12. claim;
13. withdraw principal;
14. show principal conservation / explorer proof.

Also prepare a deliberate recovery clip option:

```text
interrupt draw after a selection batch
→ reload / use another wallet
→ continue from stored cursor
→ finalize same draw
```

The final video itself must be recorded/pitched by a real person at normal speed.

Do not AI-generate the voice or pitch video.

---

# 40. Judge-Ready Onboarding

A judge should not need:

- a developer wallet;
- terminal access;
- a private RPC;
- manually inserted contract addresses;
- a DM;
- a private database;
- an admin key.

The public app must provide or explain every required step.

Include a dedicated:

**Try Serein on Sepolia**

flow that detects:

- wallet;
- network;
- public test-token balance;
- private-token balance state;
- current savings state.

Then routes to the next incomplete action.

---

# 41. Testnet and Legal Copy

Persistent but unobtrusive:

> Sepolia testnet. Test tokens have no monetary value. Serein has not been independently audited.

No investment-return promises.

No guaranteed prize language.

No gambling framing.

No `"earn X%"` without a real source and real data.

---

# 42. Performance

Targets:

- fast first meaningful paint;
- no Zama WASM load on marketing pages until needed;
- lazy/dynamic import FHE client code;
- cache public chain data safely;
- avoid reinitializing Relayer SDK unnecessarily;
- skeletons for RPC-backed content;
- no layout shift when wallet connects;
- no giant bundle on landing page.

Measure Lighthouse on production.

Target strong scores without sacrificing required wallet/FHE behavior.

---

# 43. Completion Gates by Official Judging Criterion

## 43.1 Correctness

PASS only if:

- deposit/save works live;
- TWAB history is correct;
- aggregate is proof-verified;
- rejection sampling is exact;
- selection is exact;
- claim works;
- withdrawal works;
- principal conservation proven;
- EIP-712 flows correct;
- repeated live cycles succeed.

## 43.2 Confidentiality design

PASS only if:

- leakage table complete;
- individual balances encrypted;
- individual weights encrypted;
- random target encrypted;
- winner encrypted;
- prize encrypted;
- public aggregate is deliberate and justified;
- claim metadata limitation disclosed;
- wrap/unwrap transparency boundary disclosed;
- ACL tests prove denial to unauthorized wallets.

## 43.3 UX

PASS only if:

- first-time user can complete the cycle;
- consumer language is friendly;
- mobile is first-class;
- approval/network/token/decryption errors are guided;
- private values are visually clear;
- onboarding is complete;
- product looks designed, not generated from a generic template.

## 43.4 Code quality

PASS only if:

- strict typing;
- modular contracts;
- no dead encrypted state;
- no duplicated config;
- comments explain non-obvious FHE behavior;
- lint/typecheck/build/tests clean;
- interfaces and libraries are coherent;
- dependency versions pinned intentionally;
- docs correspond to code.

## 43.5 Production readiness

PASS only if:

- stable public Cloudflare deployment;
- verified contracts;
- permissionless/resumable draw;
- HCU-aware batching;
- keeper automation or fully documented public progression;
- live evidence;
- clean-room reproduction;
- operational errors recover cleanly;
- no private developer state required.

---

# 44. Clean-Room Reproduction

Mandatory.

From a fresh clone/container with no developer-specific state:

1. install documented prerequisites;
2. copy `.env.example`;
3. run deterministic local suite;
4. compile contracts;
5. run reference-model proof;
6. run local FHE mock suite;
7. build web;
8. run Cloudflare production preview;
9. run browser smoke tests.

Live Sepolia reproduction is a separate command requiring explicit env vars.

No absolute local paths.

No hidden artifacts.

No undocumented caches.

---

# 45. Required Scripts

Aim for memorable commands such as:

```bash
pnpm install
pnpm check
pnpm test
pnpm test:fhe
pnpm test:e2e
pnpm benchmark
pnpm proof:local
pnpm deploy:sepolia
pnpm proof:sepolia
pnpm web:preview
pnpm web:deploy
pnpm cleanroom
```

Exact package manager and scripts may change, but the capability must exist.

`pnpm check` should cover:

- formatting;
- lint;
- typecheck;
- compile;
- fast deterministic tests.

---

# 46. Evidence Layout

```text
evidence/
  README.md
  deployments/
  live/
    draws/
  benchmarks/
  adversarial/
  screenshots/
  raw/
```

Each headline claim in `EVIDENCE.md` maps to:

- exact claim;
- code path;
- test;
- live transaction;
- raw artifact;
- reproduction command;
- limitation.

---

# 47. Deployment Manifest

Create machine-readable deployment metadata, e.g.:

```json
{
  "network": "sepolia",
  "chainId": 11155111,
  "commit": "...",
  "pool": "0x...",
  "prizeReserve": "0x...",
  "prizeSource": "0x...",
  "underlyingToken": "0x...",
  "confidentialToken": "0x...",
  "deployedAtBlock": 0
}
```

The web app, README, docs, and proof scripts should import/read from one canonical manifest where practical.

Avoid stale duplicated addresses.

---

# 48. Decision Log

Create `DECISIONS.md`.

At minimum record:

- why TWAB instead of point-in-time balances;
- why aggregate disclosure is accepted;
- why exact rejection sampling is used;
- why principal and prize funds are separate;
- why draw execution is permissionless/batched;
- why random target is never public;
- why participant addresses remain public;
- why claim metadata is a documented residual leak;
- why no AI agent/token/multichain layer is added;
- why Cloudflare + Alchemy were selected.

---

# 49. Canonical Technical References

The implementation agent must re-check these before coding sensitive paths.

### Zama

- Random encrypted numbers:  
  https://docs.zama.org/protocol/solidity-guides/smart-contract/operations/random
- ACL / public decryptability:  
  https://docs.zama.org/protocol/solidity-guides/smart-contract/acl
- Public decryption:  
  https://docs.zama.org/protocol/solidity-guides/smart-contract/oracle
- User decryption:  
  https://docs.zama.org/protocol/relayer-sdk-guides/fhevm-relayer/decryption/user-decryption
- Relayer SDK web apps:  
  https://docs.zama.org/protocol/relayer-sdk-guides/development-guide/webapp
- ERC-7984 wallet guide:  
  https://docs.zama.org/protocol/examples/openzeppelin-confidential-contracts/wallet-guide

### OpenZeppelin Confidential Contracts

- ERC-7984 token guide:  
  https://docs.openzeppelin.com/confidential-contracts/token
- API:  
  https://docs.openzeppelin.com/confidential-contracts/api/token
- Receiver interface:  
  https://docs.openzeppelin.com/confidential-contracts/api/interfaces
- Releases:  
  https://github.com/OpenZeppelin/openzeppelin-confidential-contracts/releases

### PoolTogether

- TWAB design:  
  https://dev.pooltogether.com/protocol/design/twab-controller/
- TWAB controller reference:  
  https://dev.pooltogether.com/protocol/reference/twab-controller/twabcontroller/

### Cloudflare

- Next.js on Workers:  
  https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- Automatic framework configuration:  
  https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/

---

# 50. Final Agent Delivery Report

When implementation is complete, the coding agent must return a concise final report containing:

```text
Product URL:
GitHub repo:
Deployment commit:

Sepolia:
- Pool:
- Prize reserve:
- Prize source:
- Underlying test token:
- ERC-7984 token:

Automation:
- Keeper URL/status:
- Draw cadence:

Verification:
- Explorer links:
- Source verification status:

Quality:
- compile:
- lint:
- typecheck:
- unit:
- FHE:
- E2E:
- clean-room:

Evidence:
- deterministic scenarios:
- live Sepolia draw cycles:
- adversarial cases:
- HCU benchmark:
- principal conservation result:

Open-source:
- issues/PRs/upstream contributions:

Known limitations:
- ...

User actions still required:
- record real-person ≤3-minute pitch
- publish X thread/article
- submit form
```

Do not say `"done"` with unresolved blockers hidden below the fold.

---

# 51. Build Command for the Autonomous Agent

The user should be able to give the coding agent this instruction with `PRD.md` and `DESIGN.md` present in the repository:

> **Build Serein. Follow `PRD.md` and `DESIGN.md` as the product and design specification. Work autonomously until every acceptance gate is satisfied. Use current canonical documentation when APIs have moved. Generate fresh Sepolia-only deployment/test wallets locally and tell me only the public address that needs funding. I will provide Sepolia ETH, an Alchemy Sepolia RPC, and any account credentials that genuinely cannot be created or accessed by you. Deploy the finished web app to Cloudflare Workers through Wrangler, deploy and verify the contracts on Sepolia, run the complete proof/evidence/clean-room campaign, and do not stop at a scaffold, happy path, or partial demo. Do not reduce scope because of deadline proximity. Ask me only for external secrets, funding, or account actions you cannot perform yourself.**

---

# 52. Product Lock

The build is locked around this central claim:

> **Serein is a confidential no-loss prize-savings protocol with encrypted time-weighted balances, mathematically exact unbiased FHE winner selection, structurally isolated principal, encrypted winner/prize state, resumable permissionless draw execution, and independently reproducible proof.**

Any implementation change that weakens that claim requires explicit justification in `DECISIONS.md`.
