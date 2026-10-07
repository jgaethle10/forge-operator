#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$ROOT/dist/submission.zip}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

node "$ROOT/validate.mjs"
mkdir -p "$TMP/submission/configs" "$TMP/submission/prompts"
cp "$ROOT/agent.yaml" "$TMP/submission/agent.yaml"
cp "$ROOT/configs/sampling.yaml" "$TMP/submission/configs/sampling.yaml"
cp "$ROOT/prompts/system.md" "$TMP/submission/prompts/system.md"

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
(
  cd "$TMP/submission"
  zip -rq "$OUT" agent.yaml configs prompts
)

LIST="$(unzip -Z1 "$OUT")"
printf '%s\n' "$LIST" | grep -qx 'agent.yaml'
if printf '%s\n' "$LIST" | grep -q '^submission/'; then
  echo "submission.zip must place agent.yaml at archive root" >&2
  exit 1
fi
if printf '%s\n' "$LIST" | grep -Eq '(^|/)\.env($|\.)|\.(pem|p12|pfx|key)$'; then
  echo "forbidden secret-bearing file type in submission.zip" >&2
  exit 1
fi

echo "Created $OUT"
unzip -l "$OUT"
