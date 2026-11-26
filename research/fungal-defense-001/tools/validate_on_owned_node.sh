#!/usr/bin/env bash
# FUNGAL-DEFENSE-001 owned-node validation; never deploys or alters other checkouts.
# Requires a reviewed immutable commit. A moving branch HEAD is not trusted.
set -Eeuo pipefail
umask 077

BRANCH='research/fungal-defense-001'
ORIGIN='https://github.com/jgaethle10/forge-operator.git'
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/evercraft/fungal-defense"

usage() {
  printf 'Usage: bash validate_on_owned_node.sh <expected-40-character-commit> [node-label]\n'
  printf 'Runs offline acceptance in a temporary GitHub checkout on this machine.\n'
}
if [[ "${1:-}" == '--help' ]]; then usage; exit 0; fi
EXPECTED_SHA="${1:-}"
NODE_LABEL="${2:-unverified-local-machine}"
if [[ ! "$EXPECTED_SHA" =~ ^[a-f0-9]{40}$ ]]; then
  printf 'BLOCKED: exact reviewed 40-character commit SHA required.\n' >&2
  usage >&2
  exit 2
fi
if ! command -v git >/dev/null || ! command -v python3 >/dev/null; then
  printf 'BLOCKED: git and python3 required.\n' >&2
  exit 2
fi
mkdir -p -- "$STATE"
WORK="$(mktemp -d "$STATE/source.XXXXXXXX")"
cleanup() {
  if [[ "$WORK" == "$STATE"/source.* && -d "$WORK" ]]; then
    rm -rf -- "$WORK"
  fi
}
trap cleanup EXIT
export GIT_TERMINAL_PROMPT=0
printf 'Retrieving canonical Fungal Defense branch into isolated checkout...\n'
git clone --quiet --depth 1 --single-branch --branch "$BRANCH" -- "$ORIGIN" "$WORK"
ACTUAL_SHA="$(git -C "$WORK" rev-parse --verify 'HEAD^{commit}')"
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  printf 'BLOCKED: expected reviewed commit %s but fetched %s. No code executed.\n' "$EXPECTED_SHA" "$ACTUAL_SHA" >&2
  exit 3
fi
printf 'Verified exact source commit: %s\n' "$ACTUAL_SHA"
# mktemp ensures distinct, privately readable receipts and avoids overwrites.
RECEIPT="$(mktemp "$STATE/node-validation.XXXXXXXX.json")"
python3 -B "$WORK/research/fungal-defense-001/tools/run_owned_validation.py" \
  --node-label "$NODE_LABEL" --output "$RECEIPT"
printf 'OFFLINE VALIDATION PASSED. Receipt: %s\n' "$RECEIPT"
printf 'This receipt is not hardware attestation or permission to publish.\n'
