#!/usr/bin/env bash
# Explicit, opt-in Node002/NextGen local llama.cpp -> Founders Arena test.
# No downloads, no cloud API, no persistent service. NOT an automatic model attestation.
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo 'Usage: bash run-owned-llama-match.sh /path/to/llama-server /path/to/model.gguf [rounds]' >&2
  exit 2
fi
SERVER_BIN=$1
MODEL_FILE=$2
ROUNDS=${3:-2}
PORT=${ARENA_LOCAL_PORT:-18477}
[[ -f "$SERVER_BIN" && -x "$SERVER_BIN" ]] || { echo 'Local llama-server binary unavailable' >&2; exit 2; }
[[ -f "$MODEL_FILE" && -r "$MODEL_FILE" ]] || { echo 'Local model GGUF unavailable' >&2; exit 2; }
[[ "$ROUNDS" =~ ^[1-9][0-9]?$ ]] && (( ROUNDS <= 50 )) || { echo 'Rounds must be 1..50' >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT >= 1024 && PORT <= 65535 )) || { echo 'Invalid local port' >&2; exit 2; }
command -v node >/dev/null || { echo 'Node 20+ required' >&2; exit 2; }
command -v curl >/dev/null || { echo 'curl required for local readiness test' >&2; exit 2; }

# Refuse to approach a port already in use, including an unrelated provider.
if ! node -e 'const s=require("net").createServer();s.once("error",()=>process.exit(1));s.listen(Number(process.argv[1]),"127.0.0.1",()=>s.close())' "$PORT"; then
  echo 'Requested local port already occupied; refusing to connect to unknown server' >&2; exit 2
fi

BIN_SHA=$(sha256sum "$SERVER_BIN" | awk '{print $1}')
MODEL_SHA=$(sha256sum "$MODEL_FILE" | awk '{print $1}')
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
OUTPUT="${PWD}/founders-arena-local-$(date -u +%Y%m%dT%H%M%SZ)-$$.json"
LOG=$(mktemp)
PID=''
cleanup(){
  if [[ -n "$PID" ]]; then kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; fi
  rm -f -- "$LOG"
}
trap cleanup EXIT INT TERM

"$SERVER_BIN" --model "$MODEL_FILE" --host 127.0.0.1 --port "$PORT" \
  --alias evercraft-arena-local --ctx-size 2048 --parallel 1 >"$LOG" 2>&1 &
PID=$!
READY=0
for _ in {1..90}; do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo 'Local llama-server stopped; last lines:' >&2; tail -n 10 "$LOG" >&2; exit 1
  fi
  if curl -fsS --max-time 1 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    READY=1; break
  fi
  sleep 1
done
if (( READY != 1 )); then echo 'Local llama-server readiness failed' >&2; exit 1; fi

printf 'Existing runtime SHA-256: %s\nExisting model SHA-256: %s\n' "$BIN_SHA" "$MODEL_SHA"
node "$ROOT/live-model-match.mjs" openai "http://127.0.0.1:$PORT/v1/chat/completions" evercraft-arena-local "$ROUNDS" "$OUTPUT"
node "$ROOT/verify-inference.mjs" "$OUTPUT"
echo "PRIVATE MATCH FILE: $OUTPUT"
echo 'Integrity was verified; model authenticity still requires independent provenance evidence.'
