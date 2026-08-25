# Decisions

Choices that were not obvious, with the reasoning and what was given up.

---

## Time-weighted balances, not point-in-time

**Why.** A draw that looks only at closing balances rewards depositing one second before it closes
and withdrawing one second after, at the expense of everyone who actually kept money in the pool.
Weight is the integral of balance over the epoch instead.

**Cost.** Every balance change appends an observation to two series, and computing a weight needs two
lookups with a `euint128` scalar multiply each. That is most of the per-participant HCU.

**Bonus.** Reading two *frozen historical* points is exactly what makes withdrawal-during-a-draw safe,
so the expensive choice is also the one that delivers the liveness property.

---

## Publishing the aggregate

**Why.** Uniform sampling over an arbitrary total needs that total in the clear, and the coprocessor's
bounded randomness only takes a power-of-two ceiling. The alternatives all approximate.

**What was rejected.** `argmax(balance_i × random_i)` is the common shortcut and does **not** yield
`W_i / ΣW`. It produces whatever the product of a weight and a uniform variate induces — biased in a
way that is hard to notice and impossible to defend in a prize draw.

**What we gave up.** A genuine disclosure. It is a sum, released only after the interval it covers is
frozen, but in a pool of one or two it discloses a lot. Surfaced in the UI at ≤4 participants rather
than buried. See PRIVACY.md.

---

## Rejection sampling over scaling

**Why.** Exact. `P(r = x | r < T) = 1/T` for every `x ∈ [0, T)`, with a written proof. Scaling `T` up
to a power of two and mapping back introduces rounding, and rounding in a prize draw is bias.

**Cost.** Expected attempts `B/T < 2`. Measured 1.4505 across 10,000 scenarios. Each extra attempt is
two transactions.

**Why the transcript can be public.** A rejection reveals only that a candidate was ≥ T, which is
independent of what a fresh draw will produce. The attempt counter leaks nothing.

---

## Prefix intervals, not a running remainder

There is a cheaper formulation: track `rem = r − Σ W_j` and test `rem < W_i`, letting the subtraction
wrap when the winner is found so no later participant can match. It saves roughly 25% of the
selection cost.

**Rejected.** It depends on `FHE.sub` wrapping rather than saturating. If that semantic ever changed,
the failure mode would be *multiple winners* — silently, with no revert. Trading a guarantee about
"exactly one winner" for 25% of one line item is not a good trade. The prefix formulation is also
what the consistency check `P == T` is written against, so it stays directly auditable.

---

## Two contracts, not one

**Why.** "No-loss" should be structural. With principal and prize money in separate contracts, there
is no code path from a draw to a saver's balance — not for an admin, not for a bug in the draw logic.
An `onlyOwner` guard would be a policy; this is an absence.

**Cost.** A cross-contract call per participant during selection, and a transient ACL grant for the
winner predicate.

---

## The winner predicate materialises a credit, rather than accumulating winnings

**Why.** Storing a per-draw credit lets a saver reveal *this draw's* result — "you won 120" or "no
prize this draw" — which is what the product needs to say. A single running `winnings[user]` would be
cheaper in storage but could not answer that question.

**Cost.** One storage slot per participant per draw, and a `select` (55,000 HCU) inside the walk.

---

## Append-only observations, not a ring buffer

**Why.** PoolTogether overwrites within a period. Doing that correctly needs a period-alignment
argument holding against every draw boundary, and getting it subtly wrong corrupts weights *silently*
rather than reverting. On a first deployment, a correctness bug you cannot see is worse than a storage
bill you can.

**Cost.** Storage grows with balance changes. Lookups stay O(log n) and no draw operation scans a
series linearly, so it costs storage rather than execution.

**Production path.** A ring buffer keyed by period with the alignment proof written out first, plus a
compaction routine folding old observations once no open draw can reference them. Not implemented
here, and not claimed to be.

---

## `MAX_SELECTION_BATCH = 8`, keeper default 5

Measured: 1,993,721 HCU per participant warm, 2,963,378 cold. Against the 20M ceiling that is 10 and
6.

**Why 8 as the ceiling and 5 as the default.** 8 fits the common path with 20% headroom. 6 is what
fits unconditionally. The keeper sits below both and halves on failure, because a batch that reverts
on HCU costs only gas — the cursor does not move. There is also a per-*block* HCU cap, so a batch
sized correctly in isolation can still fail because of someone else's transaction; the retry handles
that too.

---

## `@fhevm/solidity` 0.11.1, not 0.13.3

0.13.3 is newer. But `@openzeppelin/confidential-contracts@0.5.3` pins `0.11.1` *exactly*, and
`@fhevm/hardhat-plugin@0.4.2` requires `^0.11.1`. Taking 0.13.3 would mean abandoning either the
audited ERC-7984 implementation or the testing toolchain.

Checked before committing: Sepolia's ACL, Coprocessor and KMSVerifier addresses are byte-identical
across both versions, and `randEuint128(bound)`, `makePubliclyDecryptable` and `checkSignatures` are
present and identical in 0.11.1. Nothing was lost.

*(`SepoliaConfig` no longer exists in either — it was removed in v0.9. The config contract is
`ZamaEthereumConfig`. Worth knowing, since most guides still say otherwise.)*

---

## `@zama-fhe/relayer-sdk` 0.4.4, not `@zama-fhe/sdk` v3

Zama now markets v3 as the default SDK. Serein uses the older one because the Hardhat plugin depends
on `0.4.1`, so tests and production exercise the **same protocol code path** — the encrypted-input
format, the EIP-712 domain, and the decryption flow are identical in both. Testing one thing and
shipping another is a worse risk than being a version behind.

Isolated behind `apps/web/src/lib/fhe/sdk.ts` so the swap is one file.

---

## wagmi 2 and a hand-built connect UI

RainbowKit 2.2.11 requires `wagmi ^2.9`, so wagmi 3 would have meant no RainbowKit. Since the design
system is specific — pill CTAs, one accent, no shadows, weights capped at 500 — an off-the-shelf
modal would have been the one part of the product that looked imported. Building it also made the
failure states legible: "no wallet installed", "you declined", and "wrong network" are three
situations with three different next actions, and a generic modal collapses them into one spinner.

wagmi 2 is also what Zama's own React template uses.

---

## Vendoring the Zama SDK into `public/`

The documented CDN returns **403** for every version above 0.2.0, and the one readable artifact is
compiled against `relayer.testnet.zama.cloud` — **NXDOMAIN** — with pre-migration contract addresses.
It cannot work.

Vendoring the npm bundle at build time is more robust anyway: no third-party script origin, CSP stays
at `script-src 'self' 'wasm-unsafe-eval'`, and the version is pinned by the lockfile. The WASM lands
in Cloudflare's static assets, not the Worker bundle.

---

## Single-threaded WASM

Multi-threading needs cross-origin isolation, and `Cross-Origin-Embedder-Policy: require-corp` breaks
every cross-origin resource that has not opted in — wallet connectors included. For encrypting one
64-bit value the speedup is not worth breaking wallets.

---

## A read-only RPC proxy, not a public key

Putting the Alchemy URL in `NEXT_PUBLIC_*` ships it to every visitor. The proxy keeps it a Worker
secret and lets a disconnected visitor still read live state.

It forwards **read methods only** and refuses `eth_sendRawTransaction`, because wallets broadcast
their own transactions — relaying them would add a censorship point for nothing. It is a convenience,
not a trust dependency: everything it returns is checkable on a block explorer, and if it is down,
wallets still transact.

---

## Sourcify, not Etherscan, as the primary verifier

Etherscan needs an API key. Source verification should never be blocked on a credential a project may
not have. Sourcify needs none and produces `exact_match`, a stronger claim than Etherscan's — the
published source compiles to precisely the deployed bytecode. Etherscan runs too when a key is set.

*(The `hardhat-verify` Sourcify task is broken against the current API; see CONTRIBUTIONS.md.)*

---

## Serein's own faucet token, not a canonical Zama pair

`zama-ai/dapps` does publish live Sepolia ERC-7984 deployments, so the option was real. But there is
no open faucet a first-time visitor can mint from in one click, and the PRD's bar is that a judge
completes the cycle from a fresh wallet without a DM or an allowlist.

`TestUSDC` is rate-limited — 1,000 per claim, four-hour cooldown, 50,000 lifetime cap per address —
not because it is worth farming but because one address minting without limit could inflate the
aggregate until everyone else's odds round to nothing, which would make a live demo look broken.

The pool is written against `IERC7984`, so a deployment can point at any conforming token.

---

## A mock prize source, named as one

There is no confidential-yield venue on Sepolia to route savings through. The options were a fake
integration, a fake APY, or an honest mock. Serein ships the mock, calls it `MockPrizeSource`, and
displays no APY because none is measured. `IPrizeSource` is the seam a real adapter would occupy
without touching principal accounting or the draw algorithm.

One refinement: the source is topped up publicly (that boundary is unavoidable) but allocates to each
draw with an **encrypted input**, so per-draw prize amounts stay private even though the total funded
is visible.

---

## No AI agent, no token, no multichain layer

None of them make savings more private or the draw more fair. Each would add a surface to secure and
a claim to defend. The build is one mechanism, done properly.
