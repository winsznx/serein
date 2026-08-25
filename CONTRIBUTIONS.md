# Upstream findings

Things Serein ran into that are worth reporting back, recorded as they were found and verified rather
than manufactured to fill a section. No trivial PRs were opened for the sake of having opened one.

---

## 1. `hardhat-verify` posts to a Sourcify endpoint that no longer exists

**Where:** `@nomicfoundation/hardhat-verify`, the `verify:sourcify` task.

**What happens:** verification fails with `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.

**Cause:** the task posts to `https://sourcify.dev/server/verify`. That endpoint now returns a 404
HTML page; Sourcify moved verification to `POST /v2/verify/{chainId}/{address}`, which takes
`stdJsonInput`, `compilerVersion` and `contractIdentifier`, returns a `verificationId`, and is polled
at `GET /v2/verify/{verificationId}`.

**Evidence:**

```
GET  https://sourcify.dev/server/health   → 200 "Alive and kicking!"
POST https://sourcify.dev/server/verify   → 404 (HTML)
POST https://sourcify.dev/server/v2/verify/11155111/0x…
     → {"customCode":"invalid_parameter","message":"request/body must have required property 'stdJsonInput'"}
```

The error message points at the block explorer rather than at a stale endpoint, which sends people
looking in the wrong place.

**Workaround, and a candidate patch:** `packages/contracts/scripts/verify.ts` talks to v2 directly —
locate the build-info that compiled the source, post the standard JSON input, poll the job. All five
Serein contracts verify with `exact_match` this way. The same shape would drop into the plugin.

---

## 2. `@fhevm/hardhat-plugin` is not initialised in `hardhat run` scripts

**Where:** `@fhevm/hardhat-plugin@0.4.2`.

**What happens:** any access to `fhevm` from a script — including reading `fhevm.isMock` — throws
`HardhatFhevmError: The Hardhat Fhevm plugin is not initialized.`

**Cause:** tests get initialisation for free; scripts must call `await fhevm.initializeCLIApi()`
first. Reasonable, but the error names the state rather than the fix, and the failure surfaces on a
property read, which does not look like something that needs initialising.

**Suggestion:** name the remedy in the error — _"call `await fhevm.initializeCLIApi()` before using
`fhevm` outside the test runner"_. A one-line change that saves a documentation hunt.

---

## 3. The public relayer drops response bodies under load

**Where:** `relayer.testnet.zama.org`, via `@zama-fhe/relayer-sdk@0.4.1`.

**Observed:** `UND_ERR_BODY_TIMEOUT` after ~2s on `POST /v2/user-decrypt`, surfacing as
`RelayerV2FetchError: JSON parsing failed … Details: terminated`. Also `UND_ERR_CONNECT_TIMEOUT`
while fetching the 4.4 MB CRS from the S3 bucket that `/v2/keyurl` points at.

Both are transient and neither means the request was processed, so retrying is safe. But the SDK
surfaces them as a fetch/parse error, which reads like a protocol failure and invites callers to give
up. A keeper that gave up on the first hiccup would stall draws for reasons unrelated to the chain.

**Suggestion:** bounded retry with backoff inside the SDK for idempotent GET polling, or at minimum a
distinguishable error type so callers can tell transport failure from rejection. Serein implements the
former externally in `packages/contracts/scripts/lib/relayer.ts`.

**Why the distinction matters beyond convenience:** a confidentiality test that checks only "did this
throw" will count a body timeout as a successful refusal. That is a false pass on the most important
property in the system. Serein's probes classify transport errors separately and fail the run rather
than record an unproven claim as proven.

---

## 4. The documented SDK CDN is unusable

**Where:** the `<script src="https://cdn.zama.ai/relayer-sdk-js/…">` pattern in older guides.

**Observed:** every version above `0.2.0` returns **403 AccessDenied**. The one readable artifact,
`0.2.0`, is compiled against `relayer.testnet.zama.cloud` — which is **NXDOMAIN** — and carries the
pre-migration ACL address and `gatewayChainId: 55815` instead of `10901`.

So the only CDN build that loads is hard-wired to a host that no longer resolves and contracts that
no longer exist. Anyone following that guide gets a confusing runtime failure.

**Suggestion:** remove the CDN instructions, or restore the objects. Serein vendors the npm bundle
into its own origin at build time, which is more robust anyway and keeps the CSP at
`script-src 'self'`.

---

## 5. Ecosystem residue offered back

Two pieces here are general rather than Serein-specific, and are written to be lifted:

**`EncryptedTWAB`** (`packages/contracts/contracts/libraries/EncryptedTWAB.sol`) — time-weighted
balance accounting where the balance is a ciphertext. The design point worth reusing is the split:
timestamps stay plaintext so observations can be binary-searched and the extrapolation multiply is a
_scalar_ operation, while balance and cumulative are encrypted. Anything needing encrypted history —
confidential voting weight, streaming, vesting — needs this shape.

**`ExactWeightedRandom`** (`.../ExactWeightedRandom.sol`) — exact weighted sampling from
power-of-two-bounded encrypted randomness, via rejection sampling with a written proof of
conditional uniformity. The `argmax(weight × random)` shortcut is common and is not uniform; this is
the correction.

Also available: the measured HCU corpus in [`evidence/benchmarks/hcu.json`](evidence/benchmarks/hcu.json),
including the cold-versus-warm cache difference that decides safe batch sizes — the kind of number
that is hard to find and easy to get wrong.

---

## Status

These are recorded here with reproductions. Filing them upstream is a user action, listed in the
delivery report; nothing here has been opened as an issue yet, and this document does not claim
otherwise.
