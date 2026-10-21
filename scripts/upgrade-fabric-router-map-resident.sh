#!/usr/bin/env bash
# Operator-controlled v2 router timer promotion. Read-only unless --apply.
# Never deletes router entries or changes public DNS.
set -euo pipefail

MODE=preflight
CONFIRM_IP=""
RUNTIME_ROOT=""
usage() {
  cat <<'USAGE'
Usage: bash scripts/upgrade-fabric-router-map-resident.sh --repo-root DURABLE_CHECKOUT [--preflight]
       bash scripts/upgrade-fabric-router-map-resident.sh --repo-root DURABLE_CHECKOUT --apply --confirm-ip CURRENT_CHROMEOS_WIFI_IP

Default is a READ-ONLY preflight. Applying requires an interactive UPGRADE
confirmation. Only the Evercraft WEB scope (80/443) is installed.
No DNS or diagnostic mappings are requested.
The runtime root must be a persistent checkout, not /tmp.
USAGE
}
while (($#)); do
  case "$1" in
    --repo-root) RUNTIME_ROOT="${2:-}"; shift 2 ;;
    --preflight) MODE=preflight; shift ;;
    --apply) MODE=apply; shift ;;
    --confirm-ip) CONFIRM_IP="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown option $1" >&2; usage >&2; exit 2 ;;
  esac
done

error(){ echo "BLOCKED: $*" >&2; exit 2; }
[[ -n "$RUNTIME_ROOT" ]] || error 'provide --repo-root for the durable mapper checkout'
RUNTIME_ROOT="$(realpath -e -- "$RUNTIME_ROOT")" || error 'runtime checkout missing'
[[ "$RUNTIME_ROOT" != /tmp* && "$RUNTIME_ROOT" != /var/tmp* ]] ||
  error 'runtime checkout cannot be temporary'
for path in \
  scripts/evercraft-public-edge-map.mjs \
  scripts/edge-mapping-control.mjs \
  scripts/edge-upnp-mapping-policy.mjs \
  scripts/install-fabric-router-map-resident.sh; do
  [[ -f "$RUNTIME_ROOT/$path" ]] || error "missing runtime file $path"
done
command -v node >/dev/null || error 'Node.js unavailable'
command -v systemctl >/dev/null || error 'systemctl unavailable'
node --check "$RUNTIME_ROOT/scripts/evercraft-public-edge-map.mjs" >/dev/null
node --check "$RUNTIME_ROOT/scripts/edge-upnp-mapping-policy.mjs" >/dev/null
bash -n "$RUNTIME_ROOT/scripts/install-fabric-router-map-resident.sh"

ENV_PATH=/etc/evercraft/router-map.env
[[ -r "$ENV_PATH" ]] || error "cannot read existing $ENV_PATH"
setting() {
  local name="$1"
  grep -E "^${name}=" "$ENV_PATH" | tail -n1 | cut -d= -f2- || true
}
GATEWAY="$(setting EVERCRAFT_ROUTER_GATEWAY)"
HOST="$(setting EVERCRAFT_ROUTER_LAN_HOST)"
ORIGINAL_ROOT="$(setting EVERCRAFT_ROUTER_REPO_ROOT)"
valid_ip() {
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  local x
  local -a octets
  IFS=. read -r -a octets <<< "$1"
  for x in "${octets[@]}"; do ((10#$x <= 255)) || return 1; done
}
valid_ip "$GATEWAY" || error 'gateway not a valid IPv4 address'
valid_ip "$HOST" || error 'Chromebook target not a valid IPv4 address'
[[ "$HOST" != "$GATEWAY" ]] || error 'gateway and host must differ'
RUN_USER="$(id -un)"
[[ "$RUN_USER" != root ]] || error 'run this from the normal Penguin user, not root'
INSTALLER="$RUNTIME_ROOT/scripts/install-fabric-router-map-resident.sh"

echo "=== READ-ONLY EVERCRAFT ROUTER V2 PREFLIGHT ==="
echo "Saved gateway: $GATEWAY"
echo "Saved ChromeOS Wi-Fi target: $HOST"
echo "Existing mapper checkout: $ORIGINAL_ROOT"
echo "Candidate durable checkout: $RUNTIME_ROOT"
echo "New resident scope: web ONLY (TCP 80/443)"
echo "Current timer active: $(systemctl is-active evercraft-router-map.timer 2>/dev/null || true)"
echo "Current service active: $(systemctl is-active evercraft-router-map.service 2>/dev/null || true)"
echo "No router changes performed by this preflight."
if [[ "$MODE" == preflight ]]; then exit 0; fi

[[ -t 0 ]] || error 'apply requires an interactive terminal'
[[ -n "$CONFIRM_IP" && "$CONFIRM_IP" == "$HOST" ]] ||
  error 'confirm-ip must equal the saved ChromeOS Wi-Fi target'
echo "Before continuing, independently verify ChromeOS Settings > Network > Wi-Fi"
echo "still reports $HOST, and Linux TCP forwarding for 18080 and 8443 is enabled."
read -r -p "Type UPGRADE to install the web-only mapper with rollback: " APPROVE
[[ "$APPROVE" == UPGRADE ]] || error 'cancelled: no files changed'

STATE_DIR=/var/lib/evercraft/router-map
sudo install -d -m 0750 "$STATE_DIR"
BACKUP_DIR="$(sudo mktemp -d "$STATE_DIR/operator-upgrade.XXXXXXXX")"
FILES=(
  /etc/evercraft/router-map.env
  /usr/local/sbin/evercraft-refresh-router-map
  /etc/systemd/system/evercraft-router-map.service
  /etc/systemd/system/evercraft-router-map.timer
)
TIMER_ENABLED="$(systemctl is-enabled evercraft-router-map.timer 2>/dev/null || true)"
TIMER_ACTIVE="$(systemctl is-active evercraft-router-map.timer 2>/dev/null || true)"
for original in "${FILES[@]}"; do
  name="$(basename "$original")"
  if sudo test -f "$original"; then
    sudo cp -a -- "$original" "$BACKUP_DIR/$name"
  else
    sudo touch "$BACKUP_DIR/$name.absent"
  fi
done
echo "Backups saved at $BACKUP_DIR"
committed=0
rollback() {
  if [[ "$committed" == 1 ]]; then return; fi
  echo "ROLLBACK: restoring prior resident configuration from $BACKUP_DIR" >&2
  sudo systemctl stop evercraft-router-map.timer 2>/dev/null || true
  for original in "${FILES[@]}"; do
    name="$(basename "$original")"
    if sudo test -f "$BACKUP_DIR/$name.absent"; then
      sudo rm -f -- "$original"
    else
      sudo cp -a -- "$BACKUP_DIR/$name" "$original"
    fi
  done
  sudo systemctl daemon-reload || true
  if [[ "$TIMER_ENABLED" == enabled ]]; then
    sudo systemctl enable evercraft-router-map.timer >/dev/null 2>&1 || true
  else
    sudo systemctl disable evercraft-router-map.timer >/dev/null 2>&1 || true
  fi
  if [[ "$TIMER_ACTIVE" == active ]]; then
    sudo systemctl start evercraft-router-map.timer || true
  fi
  echo "Old timer configuration restored; router entries were not deleted." >&2
}
trap rollback EXIT
sudo systemctl stop evercraft-router-map.timer
SUDO_USER="$RUN_USER" bash "$INSTALLER" \
  --gateway "$GATEWAY" --host "$HOST" --scope web \
  --repo-root "$RUNTIME_ROOT"

# Router acknowledgement is NOT independent WAN ingress evidence.
node --input-type=module - "$STATE_DIR/latest.json" "$HOST" <<'JS'
import fs from 'node:fs';
const [file, host]=process.argv.slice(2);
const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
if(receipt.ok!==true || receipt.scope!=='web' || receipt.web_mapping_control_ok!==true ||
   receipt.public_ingress_verified!==false){
  throw Error('router receipt not web-only healthy and conservatively unverified');
}
const upnp=receipt.attempts?.find(x=>x.method==='UPnP-IGD' && x.success===true);
if(!upnp) throw Error('exact UPnP verification missing');
for(const [external,internal,desc] of [
  [80,18080,'Evercraft Fabric HTTP'],[443,8443,'Evercraft Fabric HTTPS']
]){
  const row=upnp.mappings?.find(x=>x.requested?.external===external && x.requested?.proto==='TCP');
  if(row?.success!==true || row.readback_verified!==true ||
     row.observed_host!==host || row.observed_port!==internal ||
     row.requested?.desc!==desc){
    throw Error('WAN '+external+' readback does not match the owned ChromeOS port');
  }
}
console.log('VERIFIED: local router UPnP web mappings 80/443 read back correctly');
JS
systemctl is-active --quiet evercraft-router-map.timer ||
  error 'new timer did not become active'
committed=1
trap - EXIT
echo "Installed. Rollback snapshots retained at $BACKUP_DIR."
echo "NEXT: verify production HTTPS and MCP externally before claiming recovered ingress."
