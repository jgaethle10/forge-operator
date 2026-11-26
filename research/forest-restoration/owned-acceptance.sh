#!/usr/bin/env bash
# FOREST-001: private, one-shot owned-runtime acceptance; no daemon or deployment.
set -euo pipefail
umask 077
MODE="${1:-}"
[[ "$MODE" == --self-test-only || "$MODE" == --collect ]] || { echo 'usage: bash owned-acceptance.sh --self-test-only|--collect' >&2; exit 2; }
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
STATE="${FOREST_STATE_DIR:-$HOME/.local/state/evercraft/forest-001}"
[[ "$STATE" == /* && "$STATE" != / ]] || { echo 'invalid_state_dir' >&2; exit 2; }
for dep in node sha256sum timeout curl; do command -v "$dep" >/dev/null; done
mkdir -p -- "$STATE"
RUN="$(mktemp -d "$STATE/acceptance.XXXXXXXX")"
chmod 700 "$RUN"
cd "$HERE"
sha256sum forest-001.mjs dnr-attributes.mjs qcew-baseline.mjs owned-acceptance.sh > "$RUN/source.sha256"
node --version > "$RUN/node-version.txt"
printf '%s\n' "${FOREST_SOURCE_COMMIT:-unverified}" > "$RUN/source-commit.txt"
for engine in forest-001 dnr-attributes qcew-baseline; do
  if ! timeout 30 node "$engine.mjs" --self-test > "$RUN/$engine.test.json" 2> "$RUN/$engine.test.err"; then
    printf 'HOLD: self-test failed (%s); private receipt: %s\n' "$engine" "$RUN"
    exit 1
  fi
  if ! node -e 'const x=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(x.state!=="PASS")process.exit(1)' "$RUN/$engine.test.json"; then
    printf 'HOLD: invalid test result (%s); private receipt: %s\n' "$engine" "$RUN"
    exit 1
  fi
done
printf 'PASS: three local engine self-tests; receipt: %s\n' "$RUN"
[[ "$MODE" == --collect ]] || exit 0
DNR=HOLD
YAKIMA=HOLD
KITTITAS=HOLD
if timeout 900 node dnr-attributes.mjs --collect > "$RUN/dnr.private.tmp" 2> "$RUN/dnr.err"; then
  if node -e 'const crypto=require("crypto"),x=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const s=x.snapshot;if(!s||s.state!=="RECONCILED_ATTRIBUTES_ONLY"||!Array.isArray(s.rows)||s.rows.length!==s.record_count||s.record_count===0||crypto.createHash("sha256").update(JSON.stringify(s)).digest("hex")!==x.sha256)process.exit(1)' "$RUN/dnr.private.tmp" 2>> "$RUN/dnr.err"; then
    mv -- "$RUN/dnr.private.tmp" "$RUN/dnr.private.json"
    DNR=PASS_ATTRIBUTES_ONLY
  fi
fi
collect_county() {
  local fips="$1" url="https://data.bls.gov/cew/data/api/2025/a/area/$1.csv" raw="$RUN/qcew-$1.csv"
  printf '%s\n' "$url" > "$RUN/qcew-$fips.url"
  if ! curl --disable --proto '=https' --tlsv1.2 --fail --silent --show-error --connect-timeout 15 --max-time 90 --max-filesize 33554432 --output "$raw.tmp" "$url" 2> "$RUN/qcew-$fips.err"; then return 1; fi
  mv -- "$raw.tmp" "$raw"
  if ! timeout 45 node qcew-baseline.mjs --file "$fips" 2025 "$raw" > "$RUN/qcew-$fips.json.tmp" 2>> "$RUN/qcew-$fips.err"; then return 1; fi
  if ! node -e 'const x=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const r=x.result;if(r?.schema!=="evercraft.forest-001.qcew-baseline.v1"||r.area_fips!==process.argv[2]||r.year!==2025||!r.industries.some(v=>v.state==="REPORTED"||v.state==="SUPPRESSED"))process.exit(1)' "$RUN/qcew-$fips.json.tmp" "$fips" 2>> "$RUN/qcew-$fips.err"; then return 1; fi
  mv -- "$RUN/qcew-$fips.json.tmp" "$RUN/qcew-$fips.json"
}
if collect_county 53077; then YAKIMA=PASS_BASELINE; fi
if collect_county 53037; then KITTITAS=PASS_BASELINE; fi
# Preserve raw sources and errors privately; only return state and hashes.
(
  cd "$RUN"
  for f in dnr.private.json qcew-53077.csv qcew-53037.csv qcew-53077.json qcew-53037.json; do
    if [[ -f "$f" ]]; then sha256sum -- "$f"; fi
  done
) > "$RUN/evidence.sha256"
printf 'DNR=%s\nQCEW_YAKIMA=%s\nQCEW_KITTITAS=%s\n' "$DNR" "$YAKIMA" "$KITTITAS" | tee "$RUN/status.txt"
printf 'Private receipt: %s\n' "$RUN"
if [[ "$DNR" != PASS_ATTRIBUTES_ONLY || "$YAKIMA" != PASS_BASELINE || "$KITTITAS" != PASS_BASELINE ]]; then exit 1; fi
printf '%s\n' 'PASS: source collection only; geometry join, rights review, verified demand and deployment remain HOLD.'
