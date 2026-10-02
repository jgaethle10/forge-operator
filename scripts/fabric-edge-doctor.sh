#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="${EVERCRAFT_FABRIC_DOMAIN:-fabric.systemiacommandcenters.com}"
FABRIC_PORT=8787
HTTP_PORT=18080
HTTPS_PORT=8443
ROUTER_ENV=/etc/evercraft/router-map.env
RELAY_ENV=/etc/evercraft/outbound-relay.env
RELAY_SERVICE=evercraft-fabric-outbound-relay.service
REPAIR=false
MAINTAIN_SABAN=false
TRIGGER_CANARY=false
CANARY_WORKFLOW="${EVERCRAFT_EDGE_CANARY_WORKFLOW:-evercraft-public-edge-canary.yml}"
CANARY_REPO="${EVERCRAFT_EDGE_CANARY_REPO:-jgaethle10/forge-operator}"

for arg in "$@"; do
  case "$arg" in
    --repair) REPAIR=true ;;
    --maintain-saban) MAINTAIN_SABAN=true ;;
    --trigger-canary) TRIGGER_CANARY=true ;;
    --help|-h)
      cat <<'USAGE'
Usage: sudo bash scripts/fabric-edge-doctor.sh [--repair] [--maintain-saban] [--trigger-canary]

  --repair           Reconcile the critical Fabric/edge path and router mapping.
  --maintain-saban   Separately install/repair Saban resident capacity services.
                     Saban maintenance is intentionally NOT part of edge recovery.
  --trigger-canary   When the owned edge is locally ready, dispatch the external
                     GitHub canary immediately if gh is installed/authenticated.

The doctor cannot toggle ChromeOS Linux Port Forwarding. If that is the only
remaining gate, it exits 20 and prints the exact two ChromeOS host forwards.
USAGE
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: run with sudo so the doctor can inspect and repair resident services." >&2
  exit 2
fi

RUN_USER="${SUDO_USER:-$(stat -c '%U' "$REPO_ROOT")}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
if [[ -z "$RUN_HOME" ]]; then
  echo "ERROR: could not resolve runtime user home." >&2
  exit 2
fi

json_bool(){ [[ "$1" == "true" ]] && printf true || printf false; }

RUN_UID="$(id -u "$RUN_USER")"
USER_RUNTIME_DIR="/run/user/$RUN_UID"
USER_BUS="unix:path=$USER_RUNTIME_DIR/bus"

run_as_runtime_user(){
  runuser -u "$RUN_USER" -- env     HOME="$RUN_HOME"     USER="$RUN_USER"     LOGNAME="$RUN_USER"     XDG_RUNTIME_DIR="$USER_RUNTIME_DIR"     DBUS_SESSION_BUS_ADDRESS="$USER_BUS"     "$@"
}

node_receipt="$RUN_HOME/.local/state/evercraft/organism/compute/nodeseed-receipt.json"
allocator_file="$RUN_HOME/.local/state/evercraft/organism/.secrets/allocator-token"
local_organism_install_receipt="/tmp/evercraft-edge-doctor-local-organism-install.log"
self_update_install_receipt="/tmp/evercraft-edge-doctor-self-update-install.log"
saban_capacity_install_receipt="/tmp/evercraft-edge-doctor-saban-capacity-install.log"

ensure_local_organism(){
  if [[ -f "$node_receipt" && -f "$allocator_file" ]]; then
    return 0
  fi
  if [[ ! -S "$USER_RUNTIME_DIR/bus" ]]; then
    echo "ERROR: user systemd bus unavailable at $USER_RUNTIME_DIR/bus" >&2
    return 31
  fi
  if [[ ! -f "$REPO_ROOT/systemia/compute/install-local-organism-user.sh" ]]; then
    echo "ERROR: local organism installer missing" >&2
    return 32
  fi

  echo "[repair] NodeSeed identity missing; installing/reconciling local organism..."
  set +e
  run_as_runtime_user bash "$REPO_ROOT/systemia/compute/install-local-organism-user.sh"     >"$local_organism_install_receipt" 2>&1
  local rc=$?
  set -e
  if [[ "$rc" -ne 0 ]]; then
    cat "$local_organism_install_receipt" >&2 || true
    return 33
  fi

  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [[ -f "$node_receipt" && -f "$allocator_file" ]] && return 0
    sleep 1
  done
  cat "$local_organism_install_receipt" >&2 || true
  echo "ERROR: local organism started but NodeSeed identity material did not appear" >&2
  return 34
}

ensure_fabric_update_timer(){
  if systemctl list-unit-files evercraft-fabric-update.timer --no-legend 2>/dev/null | grep -q '^evercraft-fabric-update.timer'; then
    systemctl enable --now evercraft-fabric-update.timer >/dev/null 2>&1 || true
  else
    if [[ ! -f "$REPO_ROOT/scripts/install-fabric-self-update.sh" ]]; then
      echo "ERROR: Fabric self-update installer missing" >&2
      return 41
    fi
    echo "[repair] Fabric updater missing; installing 5-minute verified updater..."
    set +e
    bash "$REPO_ROOT/scripts/install-fabric-self-update.sh"       --repo-root "$REPO_ROOT" --cadence 5min       >"$self_update_install_receipt" 2>&1
    local rc=$?
    set -e
    if [[ "$rc" -ne 0 ]]; then
      cat "$self_update_install_receipt" >&2 || true
      return 42
    fi
  fi

  systemctl daemon-reload
  systemctl enable --now evercraft-fabric-update.timer >/dev/null 2>&1 || return 43
  systemctl start evercraft-fabric-update.service >/dev/null 2>&1 || return 44
  return 0
}

ensure_saban_capacity_timer(){
  local has_timer=false
  local has_gateway=false
  local has_probation=false
  local has_dispatch=false
  local has_work_api=false
  local has_pairing_api=false
  local has_watchdog=false
  systemctl list-unit-files evercraft-saban-capacity.timer --no-legend 2>/dev/null | grep -q '^evercraft-saban-capacity.timer' && has_timer=true || true
  systemctl list-unit-files evercraft-saban-microseed-gateway.service --no-legend 2>/dev/null | grep -q '^evercraft-saban-microseed-gateway.service' && has_gateway=true || true
  systemctl list-unit-files evercraft-saban-probation.timer --no-legend 2>/dev/null | grep -q '^evercraft-saban-probation.timer' && has_probation=true || true
  systemctl list-unit-files evercraft-saban-dispatch.timer --no-legend 2>/dev/null | grep -q '^evercraft-saban-dispatch.timer' && has_dispatch=true || true
  systemctl list-unit-files evercraft-saban-work-api.service --no-legend 2>/dev/null | grep -q '^evercraft-saban-work-api.service' && has_work_api=true || true
  systemctl list-unit-files evercraft-saban-pairing-api.service --no-legend 2>/dev/null | grep -q '^evercraft-saban-pairing-api.service' && has_pairing_api=true || true
  systemctl list-unit-files evercraft-saban-watchdog.timer --no-legend 2>/dev/null | grep -q '^evercraft-saban-watchdog.timer' && has_watchdog=true || true
  if [[ "$has_timer" == "true" && "$has_gateway" == "true" && "$has_probation" == "true" && "$has_dispatch" == "true" && "$has_work_api" == "true" && "$has_pairing_api" == "true" && "$has_watchdog" == "true" ]]; then
    systemctl enable --now evercraft-saban-capacity.timer >/dev/null 2>&1 || true
    systemctl enable --now evercraft-saban-microseed-gateway.service >/dev/null 2>&1 || true
    systemctl enable --now evercraft-saban-probation.timer >/dev/null 2>&1 || true
    systemctl enable --now evercraft-saban-dispatch.timer >/dev/null 2>&1 || true
    systemctl enable --now evercraft-saban-work-api.service >/dev/null 2>&1 || true
    systemctl enable --now evercraft-saban-pairing-api.service >/dev/null 2>&1 || true
    systemctl enable --now evercraft-saban-watchdog.timer >/dev/null 2>&1 || true
  else
    if [[ ! -f "$REPO_ROOT/scripts/install-saban-capacity-organism.sh" ]]; then
      echo "ERROR: Saban capacity organism installer missing" >&2
      return 51
    fi
    echo "[repair] Saban capacity organism missing; installing zero-spend resident fabric..."
    set +e
    bash "$REPO_ROOT/scripts/install-saban-capacity-organism.sh"       --repo-root "$REPO_ROOT"       --user "$RUN_USER"       --cadence 2min       >"$saban_capacity_install_receipt" 2>&1
    local rc=$?
    set -e
    if [[ "$rc" -ne 0 ]]; then
      cat "$saban_capacity_install_receipt" >&2 || true
      return 52
    fi
  fi

  systemctl daemon-reload
  systemctl enable --now evercraft-saban-capacity.timer >/dev/null 2>&1 || return 53
  systemctl enable --now evercraft-saban-microseed-gateway.service >/dev/null 2>&1 || return 54
  systemctl enable --now evercraft-saban-probation.timer >/dev/null 2>&1 || return 55
  systemctl enable --now evercraft-saban-dispatch.timer >/dev/null 2>&1 || return 56
  systemctl enable --now evercraft-saban-work-api.service >/dev/null 2>&1 || return 57
  systemctl enable --now evercraft-saban-pairing-api.service >/dev/null 2>&1 || return 58
  systemctl enable --now evercraft-saban-watchdog.timer >/dev/null 2>&1 || return 59
  systemctl start evercraft-saban-capacity.service >/dev/null 2>&1 || return 60
  return 0
}

service_state(){
  local unit="$1"
  systemctl is-active "$unit" 2>/dev/null || true
}

tcp_probe(){
  local host="$1" port="$2"
  node - "$host" "$port" <<'NODE'
const net=require('net');
const host=process.argv[2], port=Number(process.argv[3]);
const s=net.createConnection({host,port});
let done=false;
const finish=(ok,reason='')=>{
  if(done)return; done=true; s.destroy();
  process.stdout.write(JSON.stringify({ok,host,port,reason}));
  process.exit(ok?0:1);
};
s.setTimeout(1800,()=>finish(false,'timeout'));
s.once('connect',()=>finish(true,'connected'));
s.once('error',e=>finish(false,e.message));
NODE
}

echo "=== EVERCRAFT FABRIC EDGE DOCTOR ==="
echo "repo=$REPO_ROOT"
echo "domain=$DOMAIN"

local_organism_repair_ok=true
saban_capacity_repair_ok=true
self_update_repair_ok=true
self_update_degraded=false
local_organism_repair_code=0
self_update_repair_code=0
saban_capacity_repair_code=0

if [[ "$REPAIR" == "true" ]]; then
  echo
  echo "[repair] reconciling local organism, updater, and resident edge services..."

  set +e
  ensure_local_organism
  local_organism_repair_code=$?
  set -e
  [[ "$local_organism_repair_code" -eq 0 ]] || local_organism_repair_ok=false

  set +e
  ensure_fabric_update_timer
  self_update_repair_code=$?
  set -e
  if [[ "$self_update_repair_code" -ne 0 ]]; then
    self_update_repair_ok=false
    self_update_degraded=true
    echo "[repair] WARNING: verified self-updater is degraded (code=$self_update_repair_code); continuing critical edge recovery."
  fi

  # Restore the critical public edge before touching optional resident capacity.
  systemctl enable --now evercraft-fabric.service >/dev/null 2>&1 || true
  systemctl enable --now evercraft-public-edge.service >/dev/null 2>&1 || true
  systemctl enable --now evercraft-router-map.timer >/dev/null 2>&1 || true
  if systemctl list-unit-files "$RELAY_SERVICE" --no-legend 2>/dev/null | grep -q "^$RELAY_SERVICE"; then
    systemctl enable --now "$RELAY_SERVICE" >/dev/null 2>&1 || true
  fi
  systemctl restart evercraft-fabric.service >/dev/null 2>&1 || true
  systemctl restart evercraft-public-edge.service >/dev/null 2>&1 || true
  systemctl start evercraft-router-map.service >/dev/null 2>&1 || true
  sleep 2

  if [[ "$MAINTAIN_SABAN" == "true" ]]; then
    echo
    echo "[maintenance] reconciling Saban resident capacity services after edge recovery..."
    set +e
    ensure_saban_capacity_timer
    saban_capacity_repair_code=$?
    set -e
    [[ "$saban_capacity_repair_code" -eq 0 ]] || saban_capacity_repair_ok=false
  fi
fi

fabric_state="$(service_state evercraft-fabric.service)"
edge_state="$(service_state evercraft-public-edge.service)"
router_timer_state="$(service_state evercraft-router-map.timer)"
update_timer_state="$(service_state evercraft-fabric-update.timer)"
saban_capacity_timer_state="$(service_state evercraft-saban-capacity.timer)"
saban_gateway_state="$(service_state evercraft-saban-microseed-gateway.service)"
saban_probation_timer_state="$(service_state evercraft-saban-probation.timer)"
saban_dispatch_timer_state="$(service_state evercraft-saban-dispatch.timer)"
saban_work_api_state="$(service_state evercraft-saban-work-api.service)"
saban_pairing_api_state="$(service_state evercraft-saban-pairing-api.service)"
saban_watchdog_timer_state="$(service_state evercraft-saban-watchdog.timer)"
relay_state="$(service_state "$RELAY_SERVICE")"

echo
echo "[services]"
echo "evercraft-fabric.service=$fabric_state"
echo "evercraft-public-edge.service=$edge_state"
echo "evercraft-router-map.timer=$router_timer_state"
echo "evercraft-fabric-update.timer=$update_timer_state"
echo "evercraft-saban-capacity.timer=$saban_capacity_timer_state"
echo "evercraft-saban-microseed-gateway.service=$saban_gateway_state"
echo "evercraft-saban-probation.timer=$saban_probation_timer_state"
echo "evercraft-saban-dispatch.timer=$saban_dispatch_timer_state"
echo "evercraft-saban-work-api.service=$saban_work_api_state"
echo "evercraft-saban-pairing-api.service=$saban_pairing_api_state"
echo "evercraft-saban-watchdog.timer=$saban_watchdog_timer_state"
echo "$RELAY_SERVICE=$relay_state"
if [[ "$REPAIR" == "true" ]]; then
  echo "local_organism_repair_ok=$local_organism_repair_ok"
  echo "local_organism_repair_code=$local_organism_repair_code"
  echo "self_update_repair_ok=$self_update_repair_ok"
  echo "self_update_repair_code=$self_update_repair_code"
  echo "self_update_degraded=$self_update_degraded"
  echo "saban_maintenance_requested=$MAINTAIN_SABAN"
  echo "saban_capacity_repair_ok=$saban_capacity_repair_ok"
  echo "saban_capacity_repair_code=$saban_capacity_repair_code"
fi

local_health_ok=false
local_health=""
if local_health="$(curl -fsS --max-time 4 "http://127.0.0.1:$FABRIC_PORT/health" 2>/dev/null)"; then
  local_health_ok=true
fi

echo
echo "[local Fabric]"
if [[ "$local_health_ok" == "true" ]]; then
  printf '%s\n' "$local_health"
else
  echo "UNREACHABLE http://127.0.0.1:$FABRIC_PORT/health"
fi

LAN_HOST=""
GATEWAY=""
if [[ -f "$ROUTER_ENV" ]]; then
  # This directory/file contain only bounded router mapping coordinates, not secrets.
  # The resident router-map service runs unprivileged and must be able to traverse/read them.
  chmod 0755 "$(dirname "$ROUTER_ENV")" 2>/dev/null || true
  chmod 0644 "$ROUTER_ENV" 2>/dev/null || true
  # shellcheck disable=SC1090
  source "$ROUTER_ENV"
  LAN_HOST="${EVERCRAFT_ROUTER_LAN_HOST:-}"
  GATEWAY="${EVERCRAFT_ROUTER_GATEWAY:-}"
fi

echo
echo "[router config]"
echo "gateway=${GATEWAY:-missing}"
echo "chromebook_lan_host=${LAN_HOST:-missing}"

local_edge_http_ok=false
local_edge_https_ok=false
set +e
local_http_probe="$(tcp_probe 127.0.0.1 "$HTTP_PORT" 2>/dev/null)"; local_http_rc=$?
local_https_probe="$(tcp_probe 127.0.0.1 "$HTTPS_PORT" 2>/dev/null)"; local_https_rc=$?
set -e
[[ "$local_http_rc" -eq 0 ]] && local_edge_http_ok=true
[[ "$local_https_rc" -eq 0 ]] && local_edge_https_ok=true
echo
echo "[Linux public-edge listener probes]"
echo "$local_http_probe"
echo "$local_https_probe"

lan_http_ok=false
lan_https_ok=false
if [[ -n "$LAN_HOST" ]]; then
  set +e
  http_probe="$(tcp_probe "$LAN_HOST" "$HTTP_PORT" 2>/dev/null)"; http_rc=$?
  https_probe="$(tcp_probe "$LAN_HOST" "$HTTPS_PORT" 2>/dev/null)"; https_rc=$?
  set -e
  [[ "$http_rc" -eq 0 ]] && lan_http_ok=true
  [[ "$https_rc" -eq 0 ]] && lan_https_ok=true
  echo
  echo "[ChromeOS host-forward probes]"
  echo "$http_probe"
  echo "$https_probe"
fi

router_refresh_ok=false
router_refresh=""
if [[ -x /usr/local/sbin/evercraft-refresh-router-map ]]; then
  set +e
  router_refresh="$(runuser -u "$RUN_USER" -- /usr/local/sbin/evercraft-refresh-router-map 2>&1)"
  router_rc=$?
  set -e
  [[ "$router_rc" -eq 0 ]] && router_refresh_ok=true
  echo
  echo "[router mapping refresh]"
  printf '%s\n' "$router_refresh"
fi

dns_ip="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
public_ip="$(curl -4fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"

echo
echo "[address identity]"
echo "dns_ipv4=${dns_ip:-unavailable}"
echo "public_ipv4_seen_inside=${public_ip:-unavailable}"

node_identity_ready=false
[[ -f "$node_receipt" && -f "$allocator_file" ]] && node_identity_ready=true

attestation_local_ok=false
if [[ "$local_health_ok" == "true" && "$node_identity_ready" == "true" ]]; then
  edge_supported="$(printf '%s' "$local_health" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(j.edge_attestation_supported===true?'true':'false')}catch{process.stdout.write('false')}})")"
  if [[ "$edge_supported" == "true" ]]; then
    nonce="edge_doctor_$(node -e "process.stdout.write(require('crypto').randomBytes(18).toString('hex'))")"
    if curl -fsS --max-time 5 -H 'content-type: application/json'       --data "{\"nonce\":\"$nonce\"}"       "http://127.0.0.1:$FABRIC_PORT/.well-known/evercraft-edge-attestation"       >/tmp/evercraft-edge-doctor-attestation.json 2>/dev/null; then
      attestation_local_ok=true
    fi
  fi
fi

echo
echo "[identity]"
echo "nodeseed_identity_material_present=$node_identity_ready"
echo "local_edge_attestation_responding=$attestation_local_ok"

diagnosis="unknown"
human_gate=false
ingress_transport="direct_chromeos_router"
if [[ "$local_health_ok" != "true" ]]; then
  diagnosis="fabric_runtime_unreachable"
elif [[ "$relay_state" == "active" && -f "$RELAY_ENV" ]]; then
  diagnosis="local_edge_path_ready_external_canary_required"
  ingress_transport="outbound_service_relay"
elif [[ "$local_edge_http_ok" != "true" || "$local_edge_https_ok" != "true" ]]; then
  diagnosis="public_edge_listener_unreachable"
elif [[ -n "$dns_ip" && -n "$public_ip" && "$dns_ip" != "$public_ip" ]]; then
  diagnosis="dns_public_ip_mismatch"
elif [[ "$node_identity_ready" == "true" && "$attestation_local_ok" != "true" ]]; then
  diagnosis="signed_edge_attestation_not_yet_active"
else
  diagnosis="local_edge_path_ready_external_canary_required"
fi

echo
echo "[diagnosis]"
echo "state=$diagnosis"
echo "human_gate=$human_gate"
echo "ingress_transport=$ingress_transport"

field_action="none"
if [[ "$diagnosis" == "public_edge_listener_unreachable" ]]; then
  echo
  echo "[public edge listener failure]"
  echo "Caddy/public-edge is not listening on both required Linux ports."
  echo "This is below the ChromeOS forwarding layer; do not change ChromeOS port settings."
  systemctl --no-pager --full status evercraft-public-edge.service 2>&1 || true
  journalctl -u evercraft-public-edge.service -n 80 --no-pager 2>&1 || true
fi

if [[ -n "$LAN_HOST" && ( "$lan_http_ok" != "true" || "$lan_https_ok" != "true" ) ]]; then
  echo
  echo "[ChromeOS host-forward observation]"
  echo "LAN self-probe did not reach one or both ChromeOS forwarded ports."
  echo "This observation is advisory because Crostini-to-host hairpin/self-reflection can fail even when forwarding works externally."
  echo "Authoritative ingress state comes from the independent external canary."
fi

saban_capacity_degraded=false
if [[ "$MAINTAIN_SABAN" == "true" && "$saban_capacity_repair_ok" != "true" ]]; then
  saban_capacity_degraded=true
fi

canary_trigger_state="not_requested"
canary_trigger_ok=false
if [[ "$TRIGGER_CANARY" == "true" ]]; then
  if [[ "$diagnosis" != "local_edge_path_ready_external_canary_required" ]]; then
    canary_trigger_state="blocked_until_local_edge_ready"
  elif ! command -v gh >/dev/null 2>&1; then
    canary_trigger_state="gh_not_installed"
  elif ! run_as_runtime_user gh auth status -h github.com >/dev/null 2>&1; then
    canary_trigger_state="gh_not_authenticated"
  else
    set +e
    canary_output="$(run_as_runtime_user gh workflow run "$CANARY_WORKFLOW" --repo "$CANARY_REPO" 2>&1)"
    canary_rc=$?
    set -e
    if [[ "$canary_rc" -eq 0 ]]; then
      canary_trigger_state="dispatched"
      canary_trigger_ok=true
    else
      canary_trigger_state="dispatch_failed"
    fi
    echo
    echo "[external canary trigger]"
    printf '%s\n' "$canary_output"
  fi
  echo "external_canary_trigger_state=$canary_trigger_state"
fi

cat > /tmp/evercraft-fabric-edge-doctor.json <<EOF
{
  "schema":"evercraft.fabric-edge-doctor.v1",
  "domain":"$DOMAIN",
  "local_fabric_ok":$(json_bool "$local_health_ok"),
  "fabric_service":"$fabric_state",
  "public_edge_service":"$edge_state",
  "router_map_timer":"$router_timer_state",
  "fabric_update_timer":"$update_timer_state",
  "saban_capacity_timer":"$saban_capacity_timer_state",
  "saban_microseed_gateway":"$saban_gateway_state",
  "saban_probation_timer":"$saban_probation_timer_state",
  "saban_dispatch_timer":"$saban_dispatch_timer_state",
  "saban_work_api":"$saban_work_api_state",
  "saban_pairing_api":"$saban_pairing_api_state",
  "saban_watchdog_timer":"$saban_watchdog_timer_state",
  "outbound_relay_service":"$relay_state",
  "ingress_transport":"$ingress_transport",
  "local_organism_repair_ok":$(json_bool "$local_organism_repair_ok"),
  "local_organism_repair_code":$local_organism_repair_code,
  "self_update_repair_ok":$(json_bool "$self_update_repair_ok"),
  "self_update_repair_code":$self_update_repair_code,
  "self_update_degraded":$(json_bool "$self_update_degraded"),
  "saban_maintenance_requested":$(json_bool "$MAINTAIN_SABAN"),
  "saban_capacity_repair_ok":$(json_bool "$saban_capacity_repair_ok"),
  "saban_capacity_repair_code":$saban_capacity_repair_code,
  "saban_capacity_degraded":$(json_bool "$saban_capacity_degraded"),
  "local_edge_http_listener_ok":$(json_bool "$local_edge_http_ok"),
  "local_edge_https_listener_ok":$(json_bool "$local_edge_https_ok"),
  "lan_http_forward_observed":$(json_bool "$lan_http_ok"),
  "lan_https_forward_observed":$(json_bool "$lan_https_ok"),
  "lan_forward_probe_authoritative":false,
  "router_refresh_ok":$(json_bool "$router_refresh_ok"),
  "node_identity_material_present":$(json_bool "$node_identity_ready"),
  "local_edge_attestation_responding":$(json_bool "$attestation_local_ok"),
  "dns_ipv4":"${dns_ip:-}",
  "public_ipv4_seen_inside":"${public_ip:-}",
  "diagnosis":"$diagnosis",
  "human_gate":$(json_bool "$human_gate"),
  "field_action":"$field_action",
  "required_chromeos_port_forwards":[
    {"protocol":"tcp","host_port":18080,"reachable":$(json_bool "$lan_http_ok")},
    {"protocol":"tcp","host_port":8443,"reachable":$(json_bool "$lan_https_ok")}
  ],
  "external_canary_trigger_requested":$(json_bool "$TRIGGER_CANARY"),
  "external_canary_trigger_ok":$(json_bool "$canary_trigger_ok"),
  "external_canary_trigger_state":"$canary_trigger_state",
  "next_command":"sudo bash scripts/fabric-edge-doctor.sh --repair --trigger-canary",
  "observed_at":"$(date -u +%FT%TZ)"
}
EOF

echo
cat /tmp/evercraft-fabric-edge-doctor.json

if [[ "$human_gate" == "true" ]]; then
  exit 20
fi
if [[ "$diagnosis" != "local_edge_path_ready_external_canary_required" ]]; then
  exit 10
fi
