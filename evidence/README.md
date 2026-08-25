# Evidence

Raw artifacts. **Nothing in this directory is written by hand** — every file is produced by a command,
and every command is listed here.

The claims these support, with their limitations, are in [`../EVIDENCE.md`](../EVIDENCE.md).

```
evidence/
├── deployments/           deployment manifest, stamped with the commit
├── live/
│   ├── draws/             one JSON per live Sepolia draw
│   └── withdrawal.json    live withdrawal + over-withdrawal clamp
├── benchmarks/
│   ├── hcu.json           measured HCU per operation
│   └── statistical-fairness.json
└── raw/
    └── scenario-corpus.json   10,000 deterministic scenarios
```

## Regenerating

| Artifact | Command | Needs a network? |
|---|---|---|
| `raw/scenario-corpus.json`, `benchmarks/statistical-fairness.json` | `pnpm proof:local` | No |
| `benchmarks/hcu.json` | `pnpm benchmark` | No — Hardhat mock coprocessor |
| `deployments/*` | `pnpm deploy:sepolia` | Yes, and a funded deployer |
| `live/draws/*` | `pnpm proof:sepolia` | Yes |
| `live/withdrawal.json` | `hardhat run scripts/live-withdraw.ts --network sepolia` | Yes |

The offline artifacts reproduce byte-identically: the scenario corpus is seeded, and the HCU numbers
come from a deterministic meter.

## Reading a draw artifact

Each `live/draws/draw-N.json` holds:

- `draw` — epoch bounds, participant count, the **published aggregate**, the randomness bound, how
  many candidates were drawn, and the ciphertext handles;
- `draw.steps` — every transaction hash, in order;
- `results` — per participant: their credit, whether they won, and principal **before and after**,
  each decrypted by that participant themselves;
- `confidentialityChecks` — each probe and its outcome, carrying Zama's own refusal reason verbatim;
- `gasTotals` — measured gas by operation.

## What these artifacts do not contain

- **No private keys.** Not here, not anywhere in the repository.
- **No value decrypted through a back door.** Where something is encrypted, the artifact records the
  handle and the fact that decryption was refused — not a number obtained by bypassing the ACL. The
  only decrypted values are those the recording wallet was entitled to read.
- **No fabricated activity.** Every address, hash and number came from a real transaction. The
  participants are ephemeral wallets generated for this campaign, and are labelled as such rather
  than presented as users.

## Honest framing

The scenario corpus is **10,000 deterministic scenarios, not 10,000 users**. It is evidence that the
algorithm behaves as specified across a wide input space. It says nothing about adoption.

The live campaign covers **two complete draws plus one zero-weight draw**. Small, and stated as such.
