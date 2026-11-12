#!/usr/bin/env bash
# Operator-only adult-supervised NextGen/WSL2 local classroom pilot.
# Never opens a public service, never calls Base44, never prints access tokens.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_BASE="${XDG_STATE_HOME:-$HOME/.local/state}"
STATE_DIR="$STATE_BASE/evercraft/classroom"
TOKEN="$STATE_DIR/pilot-access.token"
LLAMA_ORIGIN="${CLASSROOM_LLAMA_ORIGIN:-http://127.0.0.1:8080}"
PORT="${CLASSROOM_LOCAL_PORT:-8793}"

if ! command -v node >/dev/null 2>&1; then
  printf 'HELD: Node.js is required on this owned machine.\n' >&2
  exit 2
fi
if ! [[ "$PORT" =~ ^[0-9]{4,5}$ ]] || (( 10#$PORT < 1024 || 10#$PORT > 65535 )); then
  printf 'HELD: invalid loopback pilot port.\n' >&2
  exit 2
fi
if [[ -L "$STATE_BASE" || -L "$STATE_DIR" || -L "$TOKEN" ]]; then
  printf 'HELD: private state path must not be a symlink.\n' >&2
  exit 2
fi
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
if [[ ! -f "$TOKEN" ]]; then
  node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("base64")+"\\n")' > "$TOKEN"
fi
chmod 600 "$TOKEN"

printf 'Evercraft Infinite Classroom private pilot: loopback-only startup.\n'
printf 'A verified NextGen llama-server must already listen at %s.\n' "$LLAMA_ORIGIN"
printf 'If validation succeeds, open http://127.0.0.1:%s/ on THIS machine.\n' "$PORT"
printf 'The adult access token stays at %s; do not share it.\n' "$TOKEN"
printf 'Not authorized for unsupervised children or public internet access.\n'
exec node "$ROOT/systemia/classroom/tutor-runtime.mjs" \
  --access-token-file "$TOKEN" \
  --llama-origin "$LLAMA_ORIGIN" \
  --port "$PORT"
