# Benchmarks

Every number here was measured, not estimated. Reproduce with `pnpm benchmark`, which writes
[`evidence/benchmarks/hcu.json`](evidence/benchmarks/hcu.json).

Measurements come from the Zama Hardhat mock coprocessor, which meters the same per-operation costs
the live coprocessor charges. EVM gas figures from live Sepolia are given separately where they
differ meaningfully.

---

## The limits that matter

The coprocessor meters every FHE operation and reverts a transaction that exceeds either ceiling:

| Limit                                         |          Value | Verified                           |
| --------------------------------------------- | -------------: | ---------------------------------- |
| Sequential (dependency depth) per transaction |  5,000,000 HCU | `getMaxHCUDepthPerTx()` on Sepolia |
| Global (total) per transaction                | 20,000,000 HCU | `getMaxHCUPerTx()` on Sepolia      |

There is also a per-**block** global cap on top of the per-transaction budget, which means a batch
sized correctly in isolation can still fail when other people are transacting in the same block.
That is not a bug to design around; it is a reason the keeper retries.

---

## Measured costs

| Operation                                | Global HCU | Sequential HCU | Global headroom |   EVM gas |
| ---------------------------------------- | ---------: | -------------: | --------------: | --------: |
| `addSavings` (first, creates series)     |  3,203,288 |      1,111,000 |           84.0% | 1,254,210 |
| `addSavings` (subsequent)                |  4,158,224 |      1,111,000 |           79.2% | 1,175,933 |
| `takeOutSavings`                         |  3,039,096 |        955,032 |           84.8% |   792,074 |
| `closeDraw` (freeze + publish aggregate) |  1,215,064 |      1,215,032 |           93.9% |   324,381 |
| `processSelectionBatch(1)`               |  2,096,128 |      1,769,032 |           89.5% |   565,205 |
| `processSelectionBatch(2)`               |  4,075,256 |      2,028,032 |           79.6% |   962,172 |
| `processSelectionBatch(4)`               |  8,033,512 |      2,546,032 |           59.8% | 1,756,107 |
| `processSelectionBatch(8)` — the cap     | 15,949,768 |      3,582,032 |       **20.3%** | 3,288,300 |
| `processSelectionBatch(4)` — cold cache  | 11,853,512 |      2,546,032 |           40.7% | 1,943,610 |

Live Sepolia gas, for comparison: a deposit costs 1,567,489 gas and a claim 399,410.

---

## Per-participant cost, and why the cap is 8

Selection scales linearly — 2.10M, 4.08M, 8.03M, 15.95M for batches of 1, 2, 4, 8 — at
**1,993,721 HCU per participant** in steady state.

That participant costs, in order: one TWAB lookup at the epoch end (a cast, a `euint128` scalar
multiply at 696,000, and an addition at 259,000), the weight subtraction (260,000), the prefix
addition (259,000), two `euint128` comparisons (210,000 + 215,000), a boolean AND (25,000), and the
credit `select` in the reserve (55,000).

The opening TWAB lookup is normally **free**. Draws are contiguous, so the boundary checkpoint
written by the previous draw's walk already holds the cumulative at this epoch's start. When that
cache misses — an abandoned draw, or draws processed out of order — the opening lookup does real work
and the cost rises to **2,963,378 HCU per participant**, measured directly.

Against the 20,000,000 ceiling:

| Path                      | Per participant | Max batch |
| ------------------------- | --------------: | --------: |
| Steady state (warm cache) |       1,993,721 |        10 |
| Cold boundary cache       |       2,963,378 |         6 |

So `MAX_SELECTION_BATCH = 8` — the contract's hard ceiling, fitting the common path with 20%
headroom — and the keeper **defaults to 5** and halves on failure. A batch that reverts on HCU costs
only gas: the cursor does not move, so retrying smaller is always safe and never double-processes
anyone.

---

## Draw latency, live

| Draw | Participants | Wall-clock | Transactions |
| ---- | -----------: | ---------: | -----------: |
| #2   |            3 |        82s |            6 |
| #3   |            3 |       112s |            6 |

Six transactions per draw at this size: close, aggregate proof, generate candidate, acceptance proof,
one selection batch, consistency proof. A rejected candidate adds two.

Most of that wall-clock is not chain time. Public decryption round-trips to the Zama relayer dominate,
and the relayer is a shared service whose latency varies with load.

---

## Rejection sampling, in practice

Across 10,000 deterministic scenarios the mean number of candidates per draw is **1.4505**, and 2,896
draws needed more than one. Theory says the mean is `B/T`, bounded above by 2 and below by 1.

Checked against theory at 200,000 samples per vector:

| Weight vector              |   T |   B | Predicted mean | Observed |
| -------------------------- | --: | --: | -------------: | -------: |
| 1:1                        |   2 |   2 |         1.0000 |   1.0000 |
| 1:2                        |   3 |   4 |         1.3333 |   1.3348 |
| 1:2:7                      |  10 |  16 |         1.6000 |   1.5970 |
| uniform-6                  |   6 |   8 |         1.3333 |   1.3349 |
| 97:3                       | 100 | 128 |         1.2800 |   1.2805 |
| with zero weights          |  10 |  16 |         1.6000 |   1.6003 |
| 3:5:8 (power-of-two total) |  16 |  16 |         1.0000 |   1.0000 |

The power-of-two case is the useful sanity check: when `T` is already a power of two the bound equals
the total, acceptance is certain, and the observed mean is exactly 1.

---

## Storage growth

Each TWAB observation is three storage slots (a packed `uint64` timestamp, an `euint64` balance, an
`euint128` cumulative), appended on every balance change, for both the participant's series and the
aggregate series. A saver who deposits and withdraws ten times adds twenty observations to the
aggregate series.

Lookups stay O(log n) by binary search over public timestamps and no draw operation scans a series
linearly, so growth costs storage rather than execution. The compaction path — a ring buffer with
period alignment, as PoolTogether uses — is described in [DECISIONS.md](DECISIONS.md) and is not
implemented here, because getting its alignment argument subtly wrong corrupts weights silently
instead of reverting.

---

## What these numbers do not say

They do not say Serein "scales". At 6–8 participants per batch, a pool of 500 needs 63–84 selection
transactions per draw. That is operable with a keeper and a short cadence; a pool of 50,000 is not,
without the compaction work and a different batching strategy. The honest statement is that the cost
is linear, measured, and bounded by a documented ceiling.
