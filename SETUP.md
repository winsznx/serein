# Setup

From a fresh clone to a running app, then to your own deployment.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20.18 | 24.x used for development |
| pnpm | ≥ 10 | `corepack enable` |
| Git | any | |

Nothing else. No Docker, no global installs, no database.

---

## 1. Install and verify

```bash
git clone <repo> && cd serein
pnpm install
pnpm check
```

`pnpm check` runs formatting, lint, typecheck, contract compilation, and the fast deterministic
tests. It should finish clean on a fresh clone with no configuration at all — no keys, no RPC, no
network beyond the package registry.

## 2. Run the test suites

```bash
pnpm test          # reference model + FHE mock suite (40 contract tests, 34 model tests)
pnpm benchmark     # measure HCU, writes evidence/benchmarks/hcu.json
pnpm proof:local   # 10,000 scenarios + fairness campaign, writes evidence/
```

The FHE suite runs against Zama's mock coprocessor in-process. No network, no testnet, no keys.

## 3. Run the app

```bash
pnpm web:dev       # http://localhost:3000
```

This reads live Sepolia state through the deployed contracts in `deployments/11155111.json`. To read
through your own RPC provider rather than the public default, create `apps/web/.env.local`:

```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

To test the actual production runtime rather than the Next.js dev server:

```bash
pnpm web:preview   # builds with OpenNext and serves under workerd
```

---

## Deploying your own instance

### 1. Generate wallets

```bash
pnpm wallets:generate
```

Creates five Sepolia-only wallets in `.secrets/wallets.env` (mode 0600, gitignored) and prints
**only the public addresses**. Private keys are never printed, committed, or logged.

The script self-checks its key derivation against a known vector before generating anything — a
broken crypto dependency would otherwise produce keys whose addresses do not match, which you would
discover only after funding the wrong address.

Never reuse a personal wallet. These are throwaway testnet keys.

### 2. Configure

```bash
cp .env.example .env
```

Set `SEPOLIA_RPC_URL`. Everything else is optional; see the comments in the file.

### 3. Fund the deployer

Send Sepolia ETH to the `DEPLOYER_ADDRESS` printed in step 1. Around **0.05 ETH** covers deployment
and several live draw cycles at typical gas prices — the reference deployment cost 0.0084 ETH to
deploy. The deployer funds the keeper and test participants itself.

### 4. Deploy

```bash
pnpm deploy:sepolia
```

Deploys all five contracts, binds the reserve to the pool and prize source, verifies the binding
landed, and writes the manifest to `deployments/<chainId>.json` and `evidence/deployments/`.

Everything downstream — the app, the docs page, the scripts — reads addresses from that one file.
There is no second copy to fall out of date.

### 5. Verify source

```bash
pnpm --filter @serein/contracts verify:sepolia
```

Publishes to Sourcify, which needs no API key. Set `ETHERSCAN_API_KEY` in `.env` to verify there too.

### 6. Run a live proof campaign

```bash
pnpm --filter @serein/contracts exec hardhat run scripts/smoke-sepolia.ts --network sepolia
pnpm proof:sepolia
```

The smoke script does one encrypted input and one user decryption against the live relayer — it fails
in twenty seconds if the relayer path is broken, rather than halfway through a campaign that has
already spent gas.

`proof:sepolia` runs the full cycle: participants save, the prize is funded, the draw runs, every
confidentiality probe is attempted, results are revealed and claimed, and principal conservation is
checked per participant. Artifacts land in `evidence/live/draws/`.

Both are **resumable**. Every step re-reads on-chain state first, so a run interrupted by a rate limit
can simply be run again.

### 7. Keep draws punctual

```bash
pnpm --filter @serein/contracts keeper:sepolia            # loop
pnpm --filter @serein/contracts keeper:sepolia -- --once  # single pass
```

The keeper holds no privilege. If it stops, savers keep depositing and withdrawing, and anyone can
finish an in-flight draw.

---

## Deploying the web app

Cloudflare Workers, via OpenNext:

```bash
cd apps/web
npx wrangler login                                   # once, interactively
echo "$SEPOLIA_RPC_URL" | npx wrangler secret put SEPOLIA_RPC_URL
pnpm deploy
```

**A wrangler quirk worth knowing:** in a non-interactive shell, wrangler refuses to use its stored
OAuth token and demands `CLOUDFLARE_API_TOKEN`, even when the stored token is valid. For CI, create
an API token with `Workers Scripts: Edit` and set it in the environment.

The build stages the Zama SDK into `public/` automatically — the WASM binaries are served as static
assets, not bundled into the Worker.

---

## Repository layout

```
apps/web/                  Next.js app (Cloudflare Workers via OpenNext)
packages/contracts/        Solidity, Hardhat, deployment and live-proof scripts
packages/reference-model/  Plaintext BigInt spec, used as the parity oracle
packages/protocol-sdk/     Shared ABIs, addresses, protocol vocabulary
deployments/               Canonical address manifest
evidence/                  Generated artifacts — nothing here is written by hand
scripts/                   Wallet generation, clean-room reproduction
```

## Commands

| Command | What it does |
|---|---|
| `pnpm check` | Format, lint, typecheck, compile, fast tests |
| `pnpm test` | Reference model + FHE mock suite |
| `pnpm test:e2e` | Playwright browser tests |
| `pnpm benchmark` | Measure HCU |
| `pnpm proof:local` | Scenario corpus + fairness campaign |
| `pnpm deploy:sepolia` | Deploy contracts |
| `pnpm proof:sepolia` | Live campaign |
| `pnpm web:dev` / `web:preview` / `web:deploy` | App |
| `pnpm cleanroom` | Full reproduction from a clean checkout |

## Troubleshooting

**`The Hardhat Fhevm plugin is not initialized`** — scripts must `await fhevm.initializeCLIApi()`
before touching `fhevm`. Tests get it for free.

**`UND_ERR_BODY_TIMEOUT` / `JSON parsing failed`** — the public relayer dropping a body under load.
Transient. Serein retries with backoff; if you hit it in your own code, retry rather than treating it
as a failure.

**`Headers Timeout Error` on the first RPC call** — a slow endpoint. The Sepolia network config uses
a 120s timeout for this reason.

**`no deployment manifest for chain …`** — run `pnpm deploy:sepolia`, or check that
`deployments/<chainId>.json` has addresses.
