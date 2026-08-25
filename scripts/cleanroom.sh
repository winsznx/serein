#!/usr/bin/env bash
#
# Clean-room reproduction.
#
# Copies the repository's *tracked* files into a temporary directory — no node_modules, no build
# output, no .env, no .secrets — installs from the lockfile, and runs everything that does not need a
# funded wallet.
#
# The point is to catch the class of bug where something only works because of a file that exists on
# the author's machine and nowhere else. If this passes, a stranger with the repository and a network
# connection gets the same result.
#
# Live Sepolia reproduction is deliberately NOT part of this: it needs funds and credentials, and is
# documented separately in SETUP.md.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/serein-cleanroom.XXXXXX")"

cleanup() {
  if [ "${SEREIN_KEEP_CLEANROOM:-0}" = "1" ]; then
    echo "Left the clean room at $WORK_DIR"
  else
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "Preparing a clean checkout in $WORK_DIR"
cd "$REPO_ROOT"
# `git archive` of HEAD contains exactly the tracked files. Anything untracked — secrets, caches,
# local config — cannot leak in.
git archive --format=tar HEAD | (cd "$WORK_DIR" && tar xf -)
cd "$WORK_DIR"

# Prove the negative rather than assume it.
for forbidden in .env .secrets node_modules apps/web/.next apps/web/.open-next; do
  if [ -e "$forbidden" ]; then
    echo "FAIL: '$forbidden' made it into the clean room; it should be untracked." >&2
    exit 1
  fi
done
echo "No secrets, dependencies or build output present."

if grep -rIlE 'PRIVATE_KEY=0x[0-9a-fA-F]{64}' . >/dev/null 2>&1; then
  echo "FAIL: a private key is present in tracked files." >&2
  exit 1
fi
echo "No private key material in tracked files."

step "Installing from the lockfile"
pnpm install --frozen-lockfile

step "Format, lint, typecheck, compile, fast tests"
pnpm check

step "Reference model + FHE mock suite"
pnpm test

step "Deterministic scenario corpus and fairness campaign"
SEREIN_EVIDENCE_DIR="$WORK_DIR/evidence" pnpm proof:local

step "HCU benchmarks"
SEREIN_EVIDENCE_DIR="$WORK_DIR/evidence" pnpm benchmark

step "Building the web app"
pnpm web:build

step "Building for the Cloudflare Workers runtime"
pnpm --filter @serein/web exec opennextjs-cloudflare build

step "Comparing regenerated artifacts against the committed ones"
# The offline artifacts are deterministic — seeded PRNG, deterministic HCU meter — so a difference
# means the committed evidence no longer matches the code that supposedly produced it.
DRIFT=0
for artifact in raw/scenario-corpus.json benchmarks/statistical-fairness.json; do
  if ! diff -q "$REPO_ROOT/evidence/$artifact" "$WORK_DIR/evidence/$artifact" >/dev/null 2>&1; then
    echo "  DRIFT: evidence/$artifact differs from a fresh run"
    DRIFT=1
  else
    echo "  identical: evidence/$artifact"
  fi
done
if [ "$DRIFT" = "1" ]; then
  echo "FAIL: committed evidence does not match a fresh run. Regenerate it." >&2
  exit 1
fi

printf '\n\033[1mClean-room reproduction passed.\033[0m\n'
echo "Ran: install, check, tests, scenario corpus, fairness campaign, HCU benchmarks,"
echo "     web build, Workers build, and artifact determinism."
echo
echo "Not covered (needs funds and credentials — see SETUP.md):"
echo "  - contract deployment to Sepolia"
echo "  - the live proof campaign"
echo "  - Cloudflare deployment"
