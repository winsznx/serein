# Decisions

Choices that were not obvious, with the reasoning and what was given up.

---

## Time-weighted balances, not point-in-time

**Why.** A draw that looks only at closing balances rewards depositing one second before it closes
and withdrawing one second after, at the expense of everyone who actually kept money in the pool.
Weight is the integral of balance over the epoch instead.

**Cost.** Every balance change appends an observation to two series, and computing a weight needs two
lookups with a `euint128` scalar multiply each. That is most of the per-participant HCU.

**Bonus.** Reading two _frozen historical_ points is exactly what makes withdrawal-during-a-draw safe,
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
the failure mode would be _multiple winners_ — silently, with no revert. Trading a guarantee about
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

**Why.** Storing a per-draw credit lets a saver reveal _this draw's_ result — "you won 120" or "no
prize this draw" — which is what the product needs to say. A single running `winnings[user]` would be
cheaper in storage but could not answer that question.

**Cost.** One storage slot per participant per draw, and a `select` (55,000 HCU) inside the walk.

---

## Append-only observations, not a ring buffer

**Why.** PoolTogether overwrites within a period. Doing that correctly needs a period-alignment
argument holding against every draw boundary, and getting it subtly wrong corrupts weights _silently_
rather than reverting. On a first deployment, a correctness bug you cannot see is worse than a storage
bill you can.

**Cost.** Storage grows with balance changes. Lookups stay O(log n) and no draw operation scans a
series linearly, so it costs storage rather than execution.

**Production path.** A ring buffer keyed by period with the alignment proof written out first, plus a
compaction routine folding old observations once no open draw can reference them. Not implemented
here, and not claimed to be.

---

## `MAX_SELECTION_BATCH = 8`, keeper default 5

Measured: 1,993,721 HCU per participant warm, 2,963,378 cold. Against the 20M ceiling that is 10 and 6.

**Why 8 as the ceiling and 5 as the default.** 8 fits the common path with 20% headroom. 6 is what
fits unconditionally. The keeper sits below both and halves on failure, because a batch that reverts
on HCU costs only gas — the cursor does not move. There is also a per-_block_ HCU cap, so a batch
sized correctly in isolation can still fail because of someone else's transaction; the retry handles
that too.

---

## `@fhevm/solidity` 0.11.1, not 0.13.3

0.13.3 is newer. But `@openzeppelin/confidential-contracts@0.5.3` pins `0.11.1` _exactly_, and
`@fhevm/hardhat-plugin@0.4.2` requires `^0.11.1`. Taking 0.13.3 would mean abandoning either the
audited ERC-7984 implementation or the testing toolchain.

Checked before committing: Sepolia's ACL, Coprocessor and KMSVerifier addresses are byte-identical
across both versions, and `randEuint128(bound)`, `makePubliclyDecryptable` and `checkSignatures` are
present and identical in 0.11.1. Nothing was lost.

_(`SepoliaConfig` no longer exists in either — it was removed in v0.9. The config contract is
`ZamaEthereumConfig`. Worth knowing, since most guides still say otherwise.)_

---

## `@zama-fhe/relayer-sdk` 0.4.4, not `@zama-fhe/sdk` v3

Zama now markets v3 as the default SDK. Serein uses the older one because the Hardhat plugin depends
on `0.4.1`, so tests and production exercise the **same protocol code path** — the encrypted-input
format, the EIP-712 domain, and the decryption flow are identical in both. Testing one thing and
shipping another is a worse risk than being a version behind.

Isolated behind `apps/web/src/lib/fhe/sdk.ts` so the swap is one file.

---

## RainbowKit for wallet choice, Serein's styling for the button

The first version of this had a hand-built connect UI. It looked right and it was wrong: it offered
injected wallets and nothing else, so anyone using Rabby, Rainbow, Phantom, OKX or a phone was
effectively told to go and install MetaMask. That is not a design decision, it is a gap.

RainbowKit now owns the chooser and `ConnectButton.Custom` keeps the entry point on-system — the
modal is themed to the midnight surface, the violet accent and the pill radius, so it does not read
as an imported component. Wallets that reach the browser through an injected provider or their own
SDK are always listed; WalletConnect-backed ones appear only when a project id is configured, because
listing a wallet that fails the moment somebody picks it is worse than not listing it.

It cost something. RainbowKit's `wallets` barrel imports every wallet it supports, so the bundler
follows `frameWallet` to `@coinbase/cdp-sdk` to the optional `@x402/*` micropayment packages, and the
build fails without them. They are installed as dev dependencies and tree-shaken out of the client
bundle — measured, the bundle did not grow. A Turbopack `resolveAlias` stub would have been tidier
and does not intercept those subpath specifiers.

RainbowKit 2.2.11 requires `wagmi ^2.9`, which is a further reason wagmi stays on 2.x.

---

## Connection state in a cookie, not `localStorage`

wagmi's default is `localStorage`. With it, the server renders every page logged-out and the browser
only reconnects after mount — so a refresh or a fresh page load flashes "Connect wallet" before
snapping back to the address. Nothing is actually lost, but the product says it was, and a user who
sees that concludes the session does not survive navigation.

`cookieStorage` plus `cookieToInitialState` hands the server the real connection state, so the first
paint is already correct and there is no flash to explain away.

The trade, stated in PRIVACY.md rather than buried: the connected address now travels to the server in
a cookie on every request. It did not before. That address is public information, and the app's own
RPC proxy already sees queries about it, so nothing newly private is exposed — but it is a real
change in what the server observes and it belongs in the ledger.

A second fix was needed alongside it. wagmi passes through `reconnecting` before settling, and
treating that as "disconnected" produced the same flash from a different direction. Every screen that
gates on a wallet now distinguishes _restoring_ from _absent_, and the reveal cache is no longer
cleared on a reconnect that lands on the same account.

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

_(The `hardhat-verify` Sourcify task is broken against the current API; see [internal upstream findings](docs/internal/CONTRIBUTIONS.md).)_

---

## Zama's registered `cUSDCMock`, not a Serein-owned token

Serein's first deployment shipped its own `TestUSDC`/`ConfidentialUSDC` pair. The reasoning at the
time held: no open faucet existed on any canonical Zama Sepolia pair that a first-time visitor could
mint from in one click, and the bar was that a judge completes the cycle from a fresh wallet without a
DM or an allowlist. `TestUSDC` solved that with a rate-limited `claim()` — 1,000 per call, four-hour
cooldown, 50,000 lifetime cap per address — a guard against one address inflating the aggregate until
everyone else's odds round to nothing.

That reasoning turned out to be based on stale information. Zama's Sepolia `USDCMock`
(`0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF`) has a plain public `mint(address,uint256)`, capped at
1,000,000 tokens per call — a real, usable faucet, just not a function named `faucet()`. Verified
directly against the deployed contract before touching anything: `getConfidentialTokenAddress` on the
[Confidential Token Wrappers Registry](https://docs.zama.org/protocol/protocol-apps/confidential-tokens/wrapper-registry)
(`0x2f0750Bbb0A246059d80e94c454586a7F27a128e`) resolves that USDC mock to `cUSDCMock`
(`0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639`) with `isValid = true`; the wrapper's own `underlying()`
resolves back to the same USDC mock; and it reports `IERC7984` support via ERC-165. All three checks
are now assertions in `deploy-canonical.ts` itself, not just something verified once by hand — a
future redeploy against a revoked or changed pair fails loudly at deploy time instead of shipping
silently.

There was no code reason to keep Serein's own pair once this was known. The pool was already written
against generic `IERC7984`/`IERC7984ERC20Wrapper` — nothing in `SereinPool`, `SereinPrizeReserve`, or
`MockPrizeSource` assumes the wrapper is one Serein deployed, and the live-proof and smoke-test
scripts needed exactly one change each (mint instead of claim; see `scripts/lib/faucet.ts`) to run
against the new pair unmodified otherwise. Owning a confidential-asset contract that Zama already
operates, verifies, and maintains was two extra contracts on Serein's own audit surface for zero
product behavior.

`TestUSDC.sol`/`ConfidentialUSDC.sol` are not deleted. There is no real Zama registry to resolve
against on a local Hardhat network, so the mock-FHEVM test suite and `deploy.ts` still deploy them —
they are test fixtures now, which is what they always functionally were. The first live campaign that
ran against them is preserved as historical evidence under `evidence/legacy-custom-token/`, not
deleted, since it is still a fully verified and reproducible proof run — just of an earlier, less
Zama-native configuration than the canonical deployment that replaced it.

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

---

## No `/ops` admin page

The PRD allows one. Serein does not ship one.

The operational surface is prize funding, keeper status and draw progression. Funding is an owner
action on `MockPrizeSource` and belongs in a script, not behind a web button. Progression is
permissionless — the proof view already shows exactly where a draw is stuck, and any address can push
it forward.

That leaves a page whose only purpose is to look like an admin panel, on a product whose central
claim is that no admin exists. The CLI keeper and the deployment scripts cover the real work.

---

## A CLI keeper, not a scheduled Worker

The PRD prefers a Cloudflare scheduled Worker. Serein ships a Node CLI instead, and the reason is
worth stating rather than glossing.

Draw progression needs the Zama relayer SDK for public decryption. Its `node` build targets Node APIs
and its `web` build expects a browser with WASM and worker support; neither is a configuration that
`workerd` is known to run, and the PRD is explicit that this must be _tested_ rather than assumed.
Shipping an untested scheduled Worker would mean a keeper that silently never runs — worse than no
keeper, because it looks like one.

What makes this acceptable is that the keeper is not load-bearing. Every progression function is
permissionless, so a draw can be advanced from a CLI, from CI, or from a browser. If nobody runs one,
draws are late; nothing is lost and nothing is locked.

A `.github/workflows/keeper.yml` GitHub Actions cron now runs the same `--once` CLI pass every five
minutes, so the live app does not present a stale draw during judging. This is a scheduling
convenience layered on top of the same permissionless functions, not a new trust assumption — anyone
could stand up the identical cron against their own key, or just call the contract directly.

## `eth_getLogs`, and the block-range cap a free RPC tier imposes

The proof view's transcript reconstructs a draw's transaction history from event logs rather than a
database, so a reader can take any hash it shows and check it independently on Etherscan. The first
version of that query scanned from the contract's deployment block to `latest` — tens of thousands of
blocks. Alchemy's free tier, which the deployed Worker runs on, rejects any `eth_getLogs` call whose
range exceeds ten blocks, and that rejection was being swallowed by a `.catch(() => [])` per call. The
result: every draw's transcript loaded successfully and simply had nothing in it, silently, since the
app was first deployed.

The fix estimates a draw's block range from its own `startTimestamp`/`endTimestamp` — Sepolia averages
roughly 12.4s/block — and walks that narrow range in ten-block windows, a couple in flight at a time
so a rate-limited endpoint does not itself start rejecting the batch. The first attempt at the
estimate had a second bug worth naming: it computed a whole-number "seconds per block" and multiplied
that back out, and truncating 12.4 down to 12 across a 69,000-block span turned a 3% rounding error
into a drift of roughly 2,500 blocks — enough to land the window past the draw's own closing
transaction. The corrected version interpolates directly (one division, at the end, not a rate
computed first and reapplied), which brought the error for a real historical draw down from thousands
of blocks to under fifty.

Running the SDK under `workerd` is a genuine open question, not a closed one. It is listed as such.
