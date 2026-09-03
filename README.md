# Serein

**Private savings. Fair prizes.**

Serein is a no-loss prize savings protocol where balances and odds stay encrypted and the draw is
still exactly weighted. Savers deposit a confidential token, earn draw weight proportional to how
much they held and for how long, and can withdraw their principal at any time — including in the
middle of a draw.

Across six live Sepolia draws and 10,000 deterministic scenarios, principal conservation held for
every participant, the encrypted time-weighted balances matched the plaintext reference model
observation by observation, and every attempt to decrypt a value that should be private was refused.

**Live app:** https://serein.timjosh507.workers.dev
**Network:** Ethereum Sepolia · **Confidentiality:** Zama Protocol (FHEVM)

---

## What it does

A saver wraps a public test token into its ERC-7984 confidential form and deposits it. From that
point on:

- their **balance** is an `euint64` only they can decrypt;
- their **draw weight** is an `euint128` nobody can decrypt;
- their **odds**, the **random target**, the **winner**, and the **prize** are all encrypted;
- their **principal** is in a contract that has no function capable of spending it on a prize.

Every fifteen minutes a draw runs. It picks a winner with probability exactly `W_i / ΣW`, computed
under encryption, and pays a prize funded entirely separately from anyone's savings.

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

No rounding, no scaling, no `argmax(balance × random)`. The alternative to publishing that sum is an
approximate draw, and an approximate prize draw is not a fair one. The full argument is in
[ARCHITECTURE.md](ARCHITECTURE.md#3-exact-weighted-selection).

A sum only hides its parts when there are enough of them. With one saver it _is_ that saver's weight;
with two, either can subtract their own. The app says so whenever the pool is small enough for it to
matter, rather than describing a two-person pool as private.

---

## Live deployment

| Contract             | Address                                                                                                                         | Source                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `SereinPool`         | [`0x99eEAeAB7B8c1c9F953D4B266CA0691b9E241eaa`](https://sepolia.etherscan.io/address/0x99eEAeAB7B8c1c9F953D4B266CA0691b9E241eaa) | [verified](https://repo.sourcify.dev/11155111/0x99eEAeAB7B8c1c9F953D4B266CA0691b9E241eaa) |
| `SereinPrizeReserve` | [`0xb722f8E6903a0E20790C2456d52Ff69F6A564C78`](https://sepolia.etherscan.io/address/0xb722f8E6903a0E20790C2456d52Ff69F6A564C78) | [verified](https://repo.sourcify.dev/11155111/0xb722f8E6903a0E20790C2456d52Ff69F6A564C78) |
| `MockPrizeSource`    | [`0xae8e6ab63a90CF37692FF38593A5Ec2ac55438Da`](https://sepolia.etherscan.io/address/0xae8e6ab63a90CF37692FF38593A5Ec2ac55438Da) | [verified](https://repo.sourcify.dev/11155111/0xae8e6ab63a90CF37692FF38593A5Ec2ac55438Da) |
| `ConfidentialUSDC`   | [`0x9945fF771e3979f1E9D5938Dff459B560E32A833`](https://sepolia.etherscan.io/address/0x9945fF771e3979f1E9D5938Dff459B560E32A833) | [verified](https://repo.sourcify.dev/11155111/0x9945fF771e3979f1E9D5938Dff459B560E32A833) |
| `TestUSDC`           | [`0x45b8eFea1208dA64Bfa7f705c714FBDc6e44312B`](https://sepolia.etherscan.io/address/0x45b8eFea1208dA64Bfa7f705c714FBDc6e44312B) | [verified](https://repo.sourcify.dev/11155111/0x45b8eFea1208dA64Bfa7f705c714FBDc6e44312B) |

All five verified on Sourcify with **`exact_match`** — the published source compiles to precisely the
deployed bytecode. `SereinPool` has no owner, no admin function, and no upgrade path.

## Observed on live Sepolia

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

Raw artifacts, including every transaction hash: [`evidence/live/draws/`](evidence/live/draws/).

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
| Withdrawal is clamped, not reverted       | Live 1000× over-withdrawal in [`evidence/live/withdrawal.json`](evidence/live/withdrawal.json)                                                                                                                 |

Measured cost of the selection walk: **1,993,721 HCU per participant** in steady state, **2,963,378**
with a cold boundary cache. Against the coprocessor's 20,000,000 per-transaction ceiling that is 10
and 6 respectively — which is why `MAX_SELECTION_BATCH` is 8 and the keeper defaults to 5 and halves
on failure. See [BENCHMARKS.md](BENCHMARKS.md).

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
