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
  if [[ -n "${FOREST_QCEW_REUSE_RUN:-}" ]]; then
    # Reuse only the precise CSV bound to an explicitly supplied prior manifest hash.
    if ! node --input-type=module - "$FOREST_QCEW_REUSE_RUN" "${FOREST_QCEW_REUSE_MANIFEST_SHA256:-}" "$fips" "$raw.tmp" <<'REUSE_QCEW'
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [prior,expected,fips,out]=process.argv.slice(2);
const hash=v=>createHash('sha256').update(v).digest('hex');
if(!/^[a-f0-9]{64}$/.test(expected)||!['53077','53037'].includes(fips))throw Error('invalid_reuse_scope');
const read=(file,max)=>{
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('invalid_reuse_file');
 return fs.readFileSync(file);
};
const manifest=read(path.join(prior,'evidence.sha256'),65536);
if(hash(manifest)!==expected)throw Error('prior_manifest_hash_mismatch');
const name='qcew-'+fips+'.csv';
const entry=manifest.toString('utf8').split('\n').filter(l=>l.endsWith('  '+name));
const data=read(path.join(prior,name),33554432);
if(entry.length!==1||entry[0]!==hash(data)+'  '+name)throw Error('prior_csv_hash_mismatch');
fs.writeFileSync(out,data,{flag:'wx',mode:0o600});
REUSE_QCEW
    then return 1; fi
    printf '%s\n' "$FOREST_QCEW_REUSE_MANIFEST_SHA256" > "$RUN/qcew-$fips.reused-manifest.sha256"
  else
    if ! curl --disable --proto '=https' --tlsv1.2 --fail --silent --show-error --connect-timeout 15 --max-time 90 --max-filesize 33554432 --output "$raw.tmp" "$url" 2> "$RUN/qcew-$fips.err"; then return 1; fi
  fi
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
# Small private handoff for the existing Kaidance heartbeat; no raw source rows.
# Only pinned invocations may replace this receipt. Partial collections remain HOLD.
if [[ "${FOREST_SOURCE_COMMIT:-}" =~ ^[a-f0-9]{40}$ ]]; then
  node --input-type=module - "$STATE" "$RUN" "$FOREST_SOURCE_COMMIT" "$DNR" "$YAKIMA" "$KITTITAS" <<'FOREST_RECEIPT'
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
const [state,run,commit,dnr,qcew_yakima,qcew_kittitas]=process.argv.slice(2);
const stat=fs.lstatSync(state);
if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.uid!==process.getuid())throw Error('forest_private_state_required');
const receipt={schema:'evercraft.forest-001.owned-receipt.v1',mission_key:'FOREST-001',
 observed_at:new Date().toISOString(),source_commit:commit,
 evidence_manifest_sha256:createHash('sha256').update(fs.readFileSync(path.join(run,'evidence.sha256'))).digest('hex'),
 sources:{dnr,qcew_yakima,qcew_kittitas},execution_authorized:false,publication_authorized:false};
const dest=path.join(state,'kaidance-receipt.json'),tmp=dest+'.'+randomBytes(8).toString('hex')+'.tmp';
if(fs.existsSync(dest)&&fs.lstatSync(dest).isSymbolicLink())throw Error('forest_receipt_symlink_refused');
try{fs.writeFileSync(tmp,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,dest)}
finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
FOREST_RECEIPT
  printf '%s\n' 'Kaidance handoff: private kaidance-receipt.json written (review only).'
fi
if [[ "$DNR" != PASS_ATTRIBUTES_ONLY || "$YAKIMA" != PASS_BASELINE || "$KITTITAS" != PASS_BASELINE ]]; then exit 1; fi
printf '%s\n' 'PASS: source collection only; geometry join, rights review, verified demand and deployment remain HOLD.'
