#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="${EVERCRAFT_FABRIC_DOMAIN:-fabric.systemiacommandcenters.com}"
FABRIC_PORT=8787
HTTP_PORT=18080
HTTPS_PORT=8443
ROUTER_ENV=/etc/evercraft/router-map.env
REPAIR=false

if [[ "${1:-}" == "--repair" ]]; then
  REPAIR=true
fi

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
  systemctl list-unit-files evercraft-saban-capacity.timer --no-legend 2>/dev/null | grep -q '^evercraft-saban-capacity.timer' && has_timer=true || true
  systemctl list-unit-files evercraft-saban-microseed-gateway.service --no-legend 2>/dev/null | grep -q '^evercraft-saban-microseed-gateway.service' && has_gateway=true || true
  systemctl list-unit-files evercraft-saban-probation.timer --no-legend 2>/dev/null | grep -q '^evercraft-saban-probation.timer' && has_probation=true || true
  if [[ "$has_timer" == "true" && "$has_gateway" == "true" && "$has_probation" == "true" ]]; then
    systemctl enable --now evercraft-saban-capacity.timer >/dev/null 2>&1 || true
    systemctl enable --now evercraft-saban-microseed-gateway.service >/dev/null 2>&1 || true
    systemctl enable --now evercraft-saban-probation.timer >/dev/null 2>&1 || true
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
  systemctl start evercraft-saban-capacity.service >/dev/null 2>&1 || return 56
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
  [[ "$self_update_repair_code" -eq 0 ]] || self_update_repair_ok=false

  set +e
  ensure_saban_capacity_timer
  saban_capacity_repair_code=$?
  set -e
  [[ "$saban_capacity_repair_code" -eq 0 ]] || saban_capacity_repair_ok=false

  systemctl enable --now evercraft-fabric.service >/dev/null 2>&1 || true
  systemctl enable --now evercraft-public-edge.service >/dev/null 2>&1 || true
  systemctl enable --now evercraft-router-map.timer >/dev/null 2>&1 || true
  systemctl restart evercraft-fabric.service >/dev/null 2>&1 || true
  systemctl restart evercraft-public-edge.service >/dev/null 2>&1 || true
  systemctl start evercraft-router-map.service >/dev/null 2>&1 || true
  sleep 2
fi

fabric_state="$(service_state evercraft-fabric.service)"
edge_state="$(service_state evercraft-public-edge.service)"
router_timer_state="$(service_state evercraft-router-map.timer)"
update_timer_state="$(service_state evercraft-fabric-update.timer)"
saban_capacity_timer_state="$(service_state evercraft-saban-capacity.timer)"
saban_gateway_state="$(service_state evercraft-saban-microseed-gateway.service)"
saban_probation_timer_state="$(service_state evercraft-saban-probation.timer)"

echo
echo "[services]"
echo "evercraft-fabric.service=$fabric_state"
echo "evercraft-public-edge.service=$edge_state"
echo "evercraft-router-map.timer=$router_timer_state"
echo "evercraft-fabric-update.timer=$update_timer_state"
echo "evercraft-saban-capacity.timer=$saban_capacity_timer_state"
echo "evercraft-saban-microseed-gateway.service=$saban_gateway_state"
echo "evercraft-saban-probation.timer=$saban_probation_timer_state"
if [[ "$REPAIR" == "true" ]]; then
  echo "local_organism_repair_ok=$local_organism_repair_ok"
  echo "local_organism_repair_code=$local_organism_repair_code"
  echo "self_update_repair_ok=$self_update_repair_ok"
  echo "self_update_repair_code=$self_update_repair_code"
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
  # shellcheck disable=SC1090
  source "$ROUTER_ENV"
  LAN_HOST="${EVERCRAFT_ROUTER_LAN_HOST:-}"
  GATEWAY="${EVERCRAFT_ROUTER_GATEWAY:-}"
fi

echo
echo "[router config]"
echo "gateway=${GATEWAY:-missing}"
echo "chromebook_lan_host=${LAN_HOST:-missing}"

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
if [[ "$REPAIR" == "true" && "$local_organism_repair_ok" != "true" ]]; then
  diagnosis="local_organism_repair_failed"
elif [[ "$REPAIR" == "true" && "$self_update_repair_ok" != "true" ]]; then
  diagnosis="fabric_update_repair_failed"
elif [[ "$REPAIR" == "true" && "$saban_capacity_repair_ok" != "true" ]]; then
  diagnosis="saban_capacity_repair_failed"
elif [[ "$local_health_ok" != "true" ]]; then
  diagnosis="fabric_runtime_unreachable"
elif [[ -n "$LAN_HOST" && ( "$lan_http_ok" != "true" || "$lan_https_ok" != "true" ) ]]; then
  diagnosis="chromeos_host_forward_unreachable"
  human_gate=true
elif [[ "$router_refresh_ok" != "true" ]]; then
  diagnosis="router_mapping_refresh_failed"
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
  "local_organism_repair_ok":$(json_bool "$local_organism_repair_ok"),
  "local_organism_repair_code":$local_organism_repair_code,
  "self_update_repair_ok":$(json_bool "$self_update_repair_ok"),
  "self_update_repair_code":$self_update_repair_code,
  "saban_capacity_repair_ok":$(json_bool "$saban_capacity_repair_ok"),
  "saban_capacity_repair_code":$saban_capacity_repair_code,
  "lan_http_forward_ok":$(json_bool "$lan_http_ok"),
  "lan_https_forward_ok":$(json_bool "$lan_https_ok"),
  "router_refresh_ok":$(json_bool "$router_refresh_ok"),
  "node_identity_material_present":$(json_bool "$node_identity_ready"),
  "local_edge_attestation_responding":$(json_bool "$attestation_local_ok"),
  "dns_ipv4":"${dns_ip:-}",
  "public_ipv4_seen_inside":"${public_ip:-}",
  "diagnosis":"$diagnosis",
  "human_gate":$(json_bool "$human_gate"),
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
