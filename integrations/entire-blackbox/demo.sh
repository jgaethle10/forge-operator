#!/usr/bin/env bash
# Synthetic-only Black Box showcase. No network, payment, agent or provider operation.
set -euo pipefail
cd "$(dirname "$0")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
go build -o "$tmp/entire-blackbox" .

show() {
  local label="$1" fixture="$2" expected="$3" output
  output="$("$tmp/entire-blackbox" inspect "examples/$fixture")"
  printf '\n%s\n%s\n' "$label" "$output"
  printf '%s\n' "$output" | grep -Fq "\"assessment\":\"$expected\""
  printf '%s\n' "$output" | grep -Fq '"externally_verified":false'
}

show '1. Agent says success, no provider data: UNKNOWN' 'unknown.json' 'UNKNOWN'
show '2. Local committed claim, not authenticated: UNVERIFIED_COMMITTED_CLAIM' 'committed-unverified.json' 'UNVERIFIED_COMMITTED_CLAIM'
show '3. Contradictory local provider claims: CONFLICT' 'contradictory.json' 'CONFLICT'

if "$tmp/entire-blackbox" inspect examples/duplicate-state.json >"$tmp/out" 2>"$tmp/err"; then
  echo 'FAIL: silently accepted duplicate provider_state' >&2
  exit 1
fi
grep -Fq 'duplicate JSON member' "$tmp/err"
printf '\n4. Overwritten provider_state: REJECTED\n'
printf 'Demo assertions passed; all provider states remain unverified.\n'
