#!/usr/bin/env bash
set -Eeuo pipefail

# Controlled activation of the ALREADY-STAGED broker Caddy route.
# Mutates only /etc/evercraft/Caddyfile and restarts its dedicated edge unit.
# Restores the exact previous Caddyfile on validation/health failure.
if [[ $EUID -ne 0 || $# -ne 1 || "$1" != "--activate" ]]; then
  echo "Usage: sudo bash scripts/activate-remote-broker-caddy.sh --activate" >&2
  exit 2
fi

umask 077
exec 9>/run/lock/evercraft-remote-broker-caddy.lock
flock -n 9 || { echo "HOLD: route activation already in progress." >&2; exit 3; }

BASE="$(cd "$(dirname "$0")/.." && pwd)"
STAGER="$BASE/scripts/stage-remote-broker-caddy.mjs"
LIVE="/etc/evercraft/Caddyfile"
CANDIDATE="/tmp/evercraft-remote-broker-caddy-candidate"
ENV_FILE="/etc/evercraft/public-edge.env"
STATUS="/var/lib/evercraft/nodeseed/remote-broker-resident/status.json"
ROLLBACK_DIR="/var/lib/evercraft/broker-route-rollbacks"
ORIGIN="https://fabric.systemiacommandcenters.com"

for file in "$LIVE" "$CANDIDATE" "$STAGER" "$ENV_FILE" "$STATUS"; do
  [[ -f "$file" ]] || { echo "HOLD: required staged source or private status file missing." >&2; exit 4; }
done
if [[ "$(git hash-object "$STAGER")" != "0fe95960581e0021cf30967bf386e81ecad93692" ]]; then
  echo "HOLD: staging generator hash differs from the reviewed source." >&2
  exit 4
fi
systemctl is-active --quiet evercraft-public-edge.service ||
  { echo "HOLD: public edge service not active." >&2; exit 5; }
systemctl is-active --quiet evercraft-remote-broker-resident.service ||
  { echo "HOLD: broker resident not active." >&2; exit 5; }

# Exact-current candidate; refuse to overwrite recent site changes.
node --input-type=module - "$LIVE" "$CANDIDATE" "$STAGER" <<'NODE'
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const [live,candidate,stager]=process.argv.slice(2);
const {stageBrokerCaddyText}=await import(pathToFileURL(stager).href);
const exact=stageBrokerCaddyText(fs.readFileSync(live,'utf8')).staged;
if(exact!==fs.readFileSync(candidate,'utf8')){
  console.error('HOLD: candidate is not an exact additive transform of the current Caddyfile.');
  process.exit(6);
}
console.log('Current Caddy configuration matches the staged candidate.');
NODE

# All temporary files are private and removed on exit.
TEMP_DIR="$(mktemp -d /tmp/evercraft-broker-activate.XXXXXXXX)"
BACKUP=""
ACTIVATED=0
SUCCESS=0
finish(){
  local result=$?
  trap - EXIT
  if [[ "$ACTIVATED" -eq 1 && "$SUCCESS" -eq 0 && -n "$BACKUP" ]]; then
    echo "ROLLBACK: restoring the original Caddyfile and restarting public edge." >&2
    install -o root -g root -m 0644 "$BACKUP" "$LIVE.rollback.$$"
    mv -f "$LIVE.rollback.$$" "$LIVE"
    systemctl restart evercraft-public-edge.service || true
    curl -sS --max-time 8 -o /dev/null -w "Rolled-back MCP HTTP: %{http_code}\n" "$ORIGIN/mcp" || true
  fi
  rm -rf "$TEMP_DIR"
  exit "$result"
}
trap finish EXIT

curl -fsS --max-time 5 http://127.0.0.1:8797/v1/remote/health > "$TEMP_DIR/private.json"
node - "$STATUS" "$TEMP_DIR/private.json" <<'NODE'
const fs=require('node:fs');
const s=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const h=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const fresh=Date.now()-Date.parse(s.observed_at);
if(s.state!=='healthy'||s.local_broker_health_verified!==true||
   !Number.isFinite(fresh)||fresh>120000||fresh<0||
   !s.broker_instance_id||!s.deployment_receipt_hash||
   h.ok!==true||h.service!=='remote-capacity-broker'||
   h.runtime!=='Evercraft Compute'||
   h.instance_id!==s.broker_instance_id||
   h.deployment_receipt_bound!==true||
   h.deployment_receipt_ref!==s.deployment_receipt_hash||
   h.secure_envelope_schema!=='evercraft.secure-envelope.v1'||
   h.registered_nodes!==0||h.authorized_devices!==0){
  console.error('HOLD: private broker not healthy, unbound, stale, or already enrolled.');
  process.exit(7);
}
console.log('Private broker health and deployment identity verified; authorized devices: zero.');
NODE

set -a
. "$ENV_FILE"
set +a
/usr/bin/caddy validate --config "$CANDIDATE" --adapter caddyfile >/dev/null
/usr/bin/caddy adapt --config "$CANDIDATE" --adapter caddyfile > "$TEMP_DIR/adapted.json" 2>/dev/null

# Enforce exact method/path restrictions in the actual adapted route tree.
node - "$TEMP_DIR/adapted.json" <<'NODE'
const fs=require('node:fs');
const c=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const expectedPosts=[
 '/v1/remote/enrollment/challenge','/v1/remote/enrollment/request',
 '/v1/remote/challenge','/v1/remote/register',
 '/v1/remote/agent/poll','/v1/remote/agent/result',
].sort();
const rules=[];
function walk(v,matchers=[]){
  if(Array.isArray(v)){for(const child of v)walk(child,matchers);return;}
  if(!v||typeof v!=='object')return;
  const m=Array.isArray(v.match)?v.match.flatMap(x=>[x]):[];
  const inherited=matchers.concat(m);
  if(v.handler==='reverse_proxy'){
    const dial=(v.upstreams||[]).map(x=>x.dial||'');
    rules.push({dial,inherited});
  }
  for(const key of ['routes','handle'])if(v[key])walk(v[key],inherited);
}
for(const server of Object.values(c.apps?.http?.servers||{}))walk(server.routes||[]);
const broker=rules.filter(x=>x.dial.includes('127.0.0.1:8797'));
const fallback=rules.some(x=>x.dial.includes('127.0.0.1:8787'));
const home=rules.some(x=>x.dial.includes('127.0.0.1:4310'));
function properties(rule){
  return {
    paths:rule.inherited.flatMap(m=>Array.isArray(m.path)?m.path:[]),
    methods:rule.inherited.flatMap(m=>Array.isArray(m.method)?m.method:[]),
  };
}
const health=broker.filter(x=>{
  const m=properties(x);
  return m.paths.includes('/v1/remote/*')&&
         m.paths.includes('/v1/remote/health')&&
         m.methods.length===1&&m.methods[0]==='GET';
});
const agent=broker.filter(x=>{
  const m=properties(x);
  const exact=m.paths.filter(s=>s!=='/v1/remote/*').sort();
  return m.paths.includes('/v1/remote/*') &&
    m.methods.length===1 && m.methods[0]==='POST' &&
    JSON.stringify(exact)===JSON.stringify(expectedPosts);
});
const exposedNodes=rules.some(x=>x.dial.includes('127.0.0.1:8797') &&
  properties(x).paths.some(p=>p.startsWith('/nodes')));
if(broker.length!==2||health.length!==1||agent.length!==1||
   exposedNodes||!fallback||!home){
  console.error('HOLD: adapted routing tree differs from the approved allowlist.');
  process.exit(8);
}
console.log('Adapted Caddy tree: exact health + six agent routes; Fabric/Home preserved; no public worker-management proxy.');
NODE

before_mcp="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' "$ORIGIN/mcp")"
before_broker="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' "$ORIGIN/v1/remote/health")"
if [[ "$before_mcp" != 200 || "$before_broker" != 404 ]]; then
  echo "HOLD: current public MCP or broker baseline differs; refusing activation." >&2
  exit 9
fi

mkdir -p -m 0700 "$ROLLBACK_DIR"
BACKUP="$ROLLBACK_DIR/Caddyfile.$(date -u +%Y%m%dT%H%M%SZ).$$.before-broker"
cp -p "$LIVE" "$BACKUP"
chmod 0600 "$BACKUP"

# Confirm no drift between preflight and the moment we replace Caddyfile.
node --input-type=module - "$LIVE" "$CANDIDATE" "$STAGER" <<'NODE'
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const [live,candidate,stager]=process.argv.slice(2);
const {stageBrokerCaddyText}=await import(pathToFileURL(stager).href);
if(stageBrokerCaddyText(fs.readFileSync(live,'utf8')).staged !== fs.readFileSync(candidate,'utf8')){
  console.error('HOLD: original Caddy changed during preflight.');
  process.exit(10);
}
NODE

install -o root -g root -m 0644 "$CANDIDATE" "$LIVE.broker-next.$$"
ACTIVATED=1
mv -f "$LIVE.broker-next.$$" "$LIVE"
# Caddy has admin off in the installed edge; reload API isn't available.
systemctl restart evercraft-public-edge.service

healthy=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  code="$(curl -sS --max-time 4 -o /dev/null -w '%{http_code}' "$ORIGIN/mcp" || true)"
  if [[ "$code" == 200 ]] &&
     curl -fsS --max-time 4 "$ORIGIN/v1/remote/health" -o "$TEMP_DIR/public.json"; then
    healthy=1
    break
  fi
  sleep 1
done
if [[ "$healthy" != 1 ]]; then
  echo "FAIL: public broker and Fabric not both healthy after activation." >&2
  exit 11
fi
node - "$STATUS" "$TEMP_DIR/public.json" <<'NODE'
const fs=require('node:fs');
const s=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const h=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
if(h.ok!==true||h.service!=='remote-capacity-broker'||
   h.instance_id!==s.broker_instance_id||
   h.deployment_receipt_bound!==true||
   h.deployment_receipt_ref!==s.deployment_receipt_hash||
   h.authorized_devices!==0||
   h.secure_envelope_schema!=='evercraft.secure-envelope.v1'){
  console.error('FAIL: public broker instance or Yard receipt differs from the private instance.');
  process.exit(12);
}
console.log('Public HTTPS broker matches private Yard deployment instance and receipt.');
NODE
nodes_code="$(curl -sS --max-time 6 -o /dev/null -w '%{http_code}' "$ORIGIN/nodes/not-enrolled/v1/capacity" || true)"
wrong_method_code="$(curl -sS --max-time 6 -o /dev/null -w '%{http_code}' "$ORIGIN/v1/remote/register" || true)"
if [[ "$nodes_code" != 404 || "$wrong_method_code" != 404 ]]; then
  echo "FAIL: disallowed public worker route or method did not return 404." >&2
  exit 13
fi
SUCCESS=1
echo "ACTIVATED: public broker HTTPS route responds with the exact private deployment receipt."
echo "PUBLIC MCP: 200 | BROKER: 200 | WORKER NODES: 404 | WRONG METHOD: 404"
echo "PRIVATE BACKUP: $BACKUP"
echo "Device enrollment and outbound execution were not enabled by this script."
echo "Independent off-network verification remains required."
