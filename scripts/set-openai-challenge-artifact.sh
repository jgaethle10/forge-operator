#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${EVERCRAFT_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
TARGET="$REPO_ROOT/plugins/evercraft-fabric/openai-apps-challenge.txt"

if [[ -t 0 ]]; then
  read -r -s -p "Paste OpenAI domain verification token: " TOKEN
  echo
else
  IFS= read -r TOKEN
fi

TOKEN="${TOKEN//$'\r'/}"
TOKEN="${TOKEN//$'\n'/}"

if [[ -z "$TOKEN" || ! "$TOKEN" =~ ^[A-Za-z0-9_-]{16,512}$ ]]; then
  echo "ERROR: token format rejected" >&2
  exit 2
fi

mkdir -p "$(dirname "$TARGET")"
TMP="$(mktemp "$(dirname "$TARGET")/.openai-apps-challenge.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
printf '%s\n' "$TOKEN" > "$TMP"
chmod 0644 "$TMP"
mv "$TMP" "$TARGET"
trap - EXIT

DIGEST="$(printf '%s' "$TOKEN" | sha256sum | awk '{print $1}')"
echo "Evercraft Fabric OpenAI challenge updated."
echo "sha256=$DIGEST"
echo "restart_required=false"
echo "public_artifact=$TARGET"
