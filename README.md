# Serein

<p align="center">
  <img src="docs/assets/serein-hero.png" alt="Serein — private savings and fair prizes" width="100%" />
</p>

**Private savings. Fair prizes.**

Serein is a no-loss prize savings protocol where balances and odds stay encrypted and the draw is
still exactly weighted. Savers deposit a confidential token, earn draw weight proportional to how
much they held and for how long, and can withdraw their principal at any time — including in the
middle of a draw.

Across nine live Sepolia draw lifecycles and 10,000 deterministic scenarios, Serein exercised the
zero-weight path, multi-transaction selection, rejection sampling near its worst-case acceptance
rate, post-close withdrawals, and permissionless draw recovery. Principal conservation was verified
for every measured participant, encrypted TWAB matched the plaintext reference model, and every live
attempt to decrypt a value that should remain private was refused. The canonical deployment runs
directly on Zama's own registered confidential USDC, resolved through its on-chain wrappers registry
rather than a Serein-deployed token.

## Try Serein

|            |                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------- |
| Live app   | [serein.timjosh507.workers.dev](https://serein.timjosh507.workers.dev)                            |
| Network    | Ethereum Sepolia                                                                                  |
| Demo video | Recording pending — it will show a winning wallet collecting an encrypted prize.                  |
| X article  | [winsznlabs/status/2096187911108427889](https://x.com/winsznlabs/status/2096187911108427889?s=20) |
| Proof view | [Open proof view](https://serein.timjosh507.workers.dev/proof)                                    |
| Contracts  | [Open contract documentation](https://serein.timjosh507.workers.dev/docs/contracts)               |
| Source     | [github.com/winsznx/serein](https://github.com/winsznx/serein)                                    |

**Judge path:** Connect a Sepolia wallet → get test USDC → make it private → add savings → reveal
your balance → inspect or progress a draw → reveal and collect your result → withdraw principal.

---

## What it does

A saver wraps a public test token into its ERC-7984 confidential form and deposits it. From that
point on:

- their **balance** is an `euint64` only they can decrypt;
- their **draw weight** is an `euint128` nobody can decrypt;
- their **odds**, the **random target**, the **winner**, and the **prize** are all encrypted;
- their **principal** is in a contract that has no function capable of spending it on a prize.

Draw epochs are fifteen minutes. After an epoch closes, any address can progress the draw; the
included permissionless keeper automates those public transitions when it is running. A draw picks a
winner with probability exactly `W_i / ΣW`, computed under encryption, and pays a prize funded
entirely separately from anyone's savings.

### Try the full cycle

No token setup is required beforehand.

1. Connect a wallet on Sepolia.
2. Click **Get test USDC**.
3. Click **Make it private** to wrap it into its confidential form.
4. Add private savings.
5. Reveal your balance with an EIP-712 read authorization.
6. Inspect or progress the current draw.
7. Reveal and collect your result.
8. Withdraw principal whenever you choose.

## Where Zama is load-bearing

Serein cannot preserve its core mechanism without FHEVM:

- **ERC-7984 confidential token:** saver amounts move as encrypted values.
- **`euint64` principal:** individual savings balances remain encrypted.
- **`euint128` TWAB:** contribution over time is accumulated under FHE.
- **FHE randomness:** draw candidates are generated onchain.
- **Encrypted comparisons:** rejection sampling and interval selection execute without revealing the
  target or weights.
- **Public decryption and KMS proofs:** only the frozen aggregate and verification booleans cross
  into plaintext.
- **EIP-712 user decryption:** a saver can reveal only their own authorized balance or result.
- **ACLs:** historical observations, the random target, and winner predicates remain inaccessible.

## The one thing that is deliberately public

Selecting uniformly across an arbitrary total needs that total in the clear, and the coprocessor's
bounded randomness only accepts a power-of-two ceiling. Serein publishes **one number per draw** —
the aggregate weight, summed across everyone, released only after the draw's window is frozen — and
closes the gap with rejection sampling:

```
B = nextPowerOfTwo(T)          so that  T ≤ B < 2T
r ~ Uniform[0, B)
accept iff r < T               ⟹  P(r = x | r < T) = 1/T   for every x ∈ [0, T)
```

No rounding, no scaling, no `argmax(balance × random)`. Serein deliberately publishes the frozen
aggregate because this exact rejection-sampling construction needs a plaintext bound for the current
bounded FHE random primitive. Avoiding that disclosure would require a different selection
construction, which Serein does not claim to implement. The full argument is in
[ARCHITECTURE.md](ARCHITECTURE.md#3-exact-weighted-selection).

A sum only hides its parts when there are enough of them. With one saver it _is_ that saver's weight;
with two, either can subtract their own. The app says so whenever the pool is small enough for it to
matter, rather than describing a two-person pool as private.

---

## Live deployment

Serein's contracts, deployed and verified:

| Contract             | Address                                                                                                                         | Source                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `SereinPool`         | [`0xF55cD82dCc73286E294bC145fe0F289A67af110b`](https://sepolia.etherscan.io/address/0xF55cD82dCc73286E294bC145fe0F289A67af110b) | [verified](https://repo.sourcify.dev/11155111/0xF55cD82dCc73286E294bC145fe0F289A67af110b) |
| `SereinPrizeReserve` | [`0x25Ed8A4Ca3314Bc89Eb4B279eAAb1a174c09422f`](https://sepolia.etherscan.io/address/0x25Ed8A4Ca3314Bc89Eb4B279eAAb1a174c09422f) | [verified](https://repo.sourcify.dev/11155111/0x25Ed8A4Ca3314Bc89Eb4B279eAAb1a174c09422f) |
| `MockPrizeSource`    | [`0x02d52a957b0D342Efd4d3eE921ffC5054A12ea71`](https://sepolia.etherscan.io/address/0x02d52a957b0D342Efd4d3eE921ffC5054A12ea71) | [verified](https://repo.sourcify.dev/11155111/0x02d52a957b0D342Efd4d3eE921ffC5054A12ea71) |

The confidential asset, which Serein does not deploy or own:

| Contract         | Address                                                                                                                         | Registered by                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Zama `cUSDCMock` | [`0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639`](https://sepolia.etherscan.io/address/0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639) | [Zama's Confidential Token Wrappers Registry](https://docs.zama.org/protocol/protocol-apps/confidential-tokens/wrapper-registry) |
| Zama `USDCMock`  | [`0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF`](https://sepolia.etherscan.io/address/0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF) | the underlying `cUSDCMock` wraps                                                                                                 |

`deploy-canonical.ts` resolves this pair from Zama's registry at deploy time — it calls
`getConfidentialTokenAddress(USDCMock)`, checks `isValid`, and refuses to deploy against anything the
registry doesn't itself vouch for. See [DECISIONS.md](DECISIONS.md#zamas-registered-cusdcmock-not-a-serein-owned-token)
for why Serein moved off its own confidential token, and for the earlier deployment (still fully
verified and evidenced) that used one.

All three Serein contracts are verified on Sourcify with **`exact_match`** — the published source
compiles to precisely the deployed bytecode. `SereinPool` has no owner, no admin function, and no
upgrade path.

## Observed on the previous deployment (Serein-owned token)

Serein's first live campaign ran against a Serein-deployed `TestUSDC`/`ConfidentialUSDC` pair before
the migration to Zama's registered `cUSDCMock` described above. The mechanism did not change; only
the asset underneath it did. Kept here as the earlier, still fully-verified evidence run.

|                                | #1  | #2                | #3                | #4                | #5                  | #6                                |
| ------------------------------ | --- | ----------------- | ----------------- | ----------------- | ------------------- | --------------------------------- |
| Registered participants        | 3   | 3                 | 3                 | 3                 | **6**               | **6**                             |
| Aggregate weight               | `0` | `243,000,000,000` | `360,000,000,000` | `360,000,000,000` | `1,105,500,000,000` | `8,218,500,000,000`               |
| Randomness bound               | —   | `2^38`            | `2^39`            | `2^39`            | `2^41`              | `2^43`                            |
| Acceptance probability         | —   | 88.4%             | 65.5%             | 65.5%             | **50.3%**           | 93.5%                             |
| Candidates drawn               | —   | 1                 | 1                 | 1                 | **4 (3 rejected)**  | 1                                 |
| Selection batches              | —   | 1                 | 1                 | 1                 | **2**               | **2, by two different addresses** |
| Principal conserved            | —   | all 3             | all 3             | all 3             | **all 6**           | all 6                             |
| Confidentiality probes refused | —   | 4/4               | 4/4               | 4/4               | 4/4                 | 4/4                               |

Every non-zero aggregate matches the value derived from the public deposit timestamps, to the unit.
`scripts/verify-aggregate.ts` recomputes any draw's total from the observation series and compares.

**Draw #1** exercised the zero-weight path: all three deposits landed 120 seconds _after_ its window
closed, so the protocol verified the aggregate as zero and finalized with no winner.

**Draw #4** demonstrates the frozen-weight invariant. Participant A had withdrawn everything and held
zero principal when results were claimed, yet was a full participant with 25% odds — their withdrawal
landed after the epoch closed. A later withdrawal cannot reduce an entry already earned.

**Draw #6** is the recovery drill. The keeper closed the draw, verified the aggregate, accepted a
candidate, walked two of six participants — and stopped. A **different address**, a participant
wallet holding no operational role, read the stored cursor and finished the remaining four. The
consistency proof still verified, which it could not have done had anyone been skipped or walked
twice. That is the liveness claim demonstrated rather than asserted: the keeper really is not
special.

**Draw #5** is the strongest artifact. Its total landed just above `2^40`, so the bound was `2^41` and
acceptance was **50.3%** — the theoretical worst case for rejection sampling, which produced three
rejected candidates before one was accepted. Six participants at a batch size of five forced the
selection walk across two transactions, exercising the stored cursor on chain rather than only in
tests. And the aggregate decomposes as:

```
A: 100 × 228s + 75 × 36s  =    25,500,000,000   partial withdrawal, then full exit, mid-epoch
B: 250 × 3600s            =   900,000,000,000
C:  50 × 3600s            =   180,000,000,000
D, E, F                   =                 0   registered, but deposited after the window closed
                             -----------------
                published =  1,105,500,000,000
```

A's figure is the piecewise integral across two balance changes _inside_ the epoch — not
`final_balance × epoch` (which gives 0) nor `initial_balance × epoch` (which gives 360,000,000,000).
The encrypted TWAB is integrating correctly, not merely plausibly. D, E and F were frozen into the
draw with zero weight and none could win. All six claims cost 399,406–399,410 gas: indistinguishable,
which is what keeps claiming from disclosing the outcome.

Raw artifacts, including every transaction hash:
[`evidence/legacy-custom-token/live/draws/`](evidence/legacy-custom-token/live/draws/).

---

## Observed on the canonical deployment (Zama's `cUSDCMock`)

The same mechanism, re-proven end to end on Zama's registered asset rather than Serein's own.

|                                | #1    | #2                  | #3                                |
| ------------------------------ | ----- | ------------------- | --------------------------------- |
| Registered participants        | 6     | 6                   | 6                                 |
| Aggregate weight               | `0`   | `1,406,400,000,000` | `1,147,500,000,000`               |
| Randomness bound               | —     | `2^41`              | `2^41`                            |
| Candidates drawn               | —     | 1 (0 rejected)      | 1 (0 rejected)                    |
| Selection batches              | —     | 2 (5 then 1)        | **2, by two different addresses** |
| Principal conserved            | all 6 | all 6               | —                                 |
| Confidentiality probes refused | 4/4   | 4/4                 | —                                 |

**Draw #1** landed the zero-weight path again, for the same structural reason as the legacy deployment's
first draw: every deposit arrived after the newly-opened epoch's window had already closed (the
migration itself took longer than one 900-second draw). All six claims cost the same gas regardless of
outcome, and every principal came back unchanged.

**Draw #2** is a full weighted draw on the canonical asset: six participants held their balance for
the entire 1,800-second window, one candidate was accepted on the first attempt, and the selection walk
split across two transactions (5 participants, then 1) — the same stored-cursor mechanism exercised
before, now proven again on Zama's own wrapper. Participant B won; every claim, winning or not, cost
within 5 gas units of the same amount. The published aggregate was independently recomputed from the
six participants' on-chain observation timestamps via `scripts/verify-aggregate.ts` and matched
exactly: `1,406,400,000,000`.

**Draw #3** is the recovery drill, re-run on the canonical asset. The keeper closed the draw, verified
the aggregate, accepted a candidate, walked two of six participants — and stopped. A **different
address**, a participant wallet holding no operational role, read the stored cursor and finished the
remaining four. The consistency proof still verified, which it could not have done had anyone been
skipped or walked twice — the same liveness claim proven before, now on Zama's own wrapper. Its
aggregate, `1,147,500,000,000`, was also independently recomputed and matched exactly.

Raw artifacts: [`evidence/live/draws/`](evidence/live/draws/).

---

## Verify it yourself

The proof view prints the random target's ciphertext handle. Take it, ask the Zama relayer to
decrypt it, and watch it refuse — that handle was never marked publicly decryptable and never granted
to any address. The live campaign does exactly this on every run and fails if any probe succeeds:

```
REFUSED  public decryption of the random target
REFUSED  public decryption of a participant's savings balance
REFUSED  participant B decrypting participant A's savings balance
REFUSED  decryption of participant A's historical observation
ALLOWED  public decryption of the frozen aggregate → 360000000000 (matches on-chain: true)
```

---

## Evidence

| Claim                                     | Where it is checked                                                                                                                                                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selection is exactly `W_i / ΣW`           | Proof in [ARCHITECTURE.md §3.3](ARCHITECTURE.md#33-rejection-sampling); 8 weight vectors × 200,000 samples in [`evidence/benchmarks/statistical-fairness.json`](evidence/benchmarks/statistical-fairness.json) |
| Encrypted TWAB matches the plaintext spec | Observation-by-observation parity in `packages/contracts/test/parity.fhe.test.ts`                                                                                                                              |
| Every invariant holds across scenarios    | 10,000 deterministic scenarios, 12 shapes, in [`evidence/raw/scenario-corpus.json`](evidence/raw/scenario-corpus.json)                                                                                         |
| Private values cannot be read by others   | 31 adversarial tests in `packages/contracts/test/adversarial.fhe.test.ts`, plus live probes                                                                                                                    |
| Principal survives every draw             | Live: `principalConserved` per participant in each draw artifact                                                                                                                                               |
| Batch sizing is safe                      | Measured HCU in [`evidence/benchmarks/hcu.json`](evidence/benchmarks/hcu.json)                                                                                                                                 |
| Withdrawal is clamped, not reverted       | Live 1000× over-withdrawal in [`evidence/legacy-custom-token/live/withdrawal.json`](evidence/legacy-custom-token/live/withdrawal.json)                                                                         |

Measured cost of the selection walk: **1,993,721 HCU per participant** in steady state, **2,963,378**
with a cold boundary cache. Against the coprocessor's 20,000,000 per-transaction ceiling that is 10
and 6 respectively — which is why `MAX_SELECTION_BATCH` is 8 and the keeper defaults to 5 and halves
on failure. See [BENCHMARKS.md](BENCHMARKS.md).

---

## Prize source

Sepolia uses `MockPrizeSource`. It funds `SereinPrizeReserve` independently of saver principal. It
does not simulate APY, and Serein does not display a fake yield rate.

Production integrations implement `IPrizeSource`. That adapter may source real confidential yield
without changing principal accounting, TWAB, winner selection, or claim logic.

## Failure and recovery UX

| Condition                               | Serein behavior                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Wallet disconnected                     | Connect-wallet state; no write is attempted.                                                             |
| Wrong network                           | Writes are blocked and the app offers a one-click Sepolia switch.                                        |
| No test token                           | The **Get test USDC** faucet action is shown.                                                            |
| No confidential balance                 | The **Make it private** step is shown before savings can be added.                                       |
| User rejects a signature or transaction | The value stays hidden or the write remains unsent; the user can safely retry.                           |
| Relayer transport failure               | The app and proof scripts retry with backoff; transport failures are never recorded as privacy refusals. |
| Over-withdrawal                         | The encrypted withdrawal is clamped to actual principal, avoiding a balance oracle.                      |
| Draw batch failure                      | The stored cursor remains unchanged; anyone can retry safely.                                            |
| Keeper stops                            | Another address can resume from the stored cursor.                                                       |
| Unsupported asset                       | Asset selection is not offered: the deployed underlying/confidential pair is the only accepted pair.     |

---

## Repository

```
apps/web/                Next.js app, deployed to Cloudflare Workers via OpenNext
packages/contracts/      Solidity, Hardhat, FHE mock + live Sepolia scripts
packages/reference-model/ Plaintext BigInt spec of TWAB and weighted selection
packages/protocol-sdk/   Shared ABIs, addresses, protocol vocabulary
deployments/             The canonical address manifest — one copy, imported everywhere
evidence/                Raw artifacts, none of them hand-written
docs, ARCHITECTURE.md, SECURITY.md, PRIVACY.md, DECISIONS.md, BENCHMARKS.md, EVIDENCE.md
```

## Quick start

```bash
pnpm install
pnpm check          # format, lint, typecheck, compile, fast tests
pnpm test           # reference model + FHE mock suite
pnpm benchmark      # measure HCU, writes evidence/benchmarks/hcu.json
pnpm proof:local    # 10,000 scenarios + fairness campaign
pnpm web:dev        # run the app locally
```

Full setup, including deploying your own instance, is in [SETUP.md](SETUP.md).

---

## Honest limitations

- **Not audited.** Testnet only. Test tokens have no monetary value.
- **The prize reserve is funded by an operator, not by yield.** No confidential-yield venue exists on
  Sepolia to route savings through, so inventing one would mean a fake integration or a fake APY.
  Serein does neither and displays no APY. `IPrizeSource` is the seam a real adapter would occupy.
- **Confidentiality depends on the Zama KMS** being honest and available.
- **Storage grows** with participants and balance changes; the selection walk grows with participant
  count. The point where that stops being comfortable is measured in BENCHMARKS.md, not glossed as
  "scales".
- **The public relayer is flaky under load.** Serein retries with backoff rather than treating a
  transport failure as a protocol failure, but it is a real dependency.

## Licence

MIT. See [LICENSE](LICENSE).
