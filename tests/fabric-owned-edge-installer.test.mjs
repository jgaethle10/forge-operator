import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const script=fs.readFileSync(new URL('../scripts/install-fabric-owned-edge.sh',import.meta.url),'utf8');
const updater=fs.readFileSync(new URL('../scripts/update-fabric-owned-edge.sh',import.meta.url),'utf8');
const updaterInstaller=fs.readFileSync(new URL('../scripts/install-fabric-self-update.sh',import.meta.url),'utf8');
const networkObserverInstaller=fs.readFileSync(new URL('../scripts/install-fabric-network-observer.sh',import.meta.url),'utf8');
const routerMapInstaller=fs.readFileSync(new URL('../scripts/install-fabric-router-map-resident.sh',import.meta.url),'utf8');
const routerMapper=fs.readFileSync(new URL('../scripts/evercraft-public-edge-map.mjs',import.meta.url),'utf8');

test('owned edge installer keeps Fabric private behind the TLS proxy',()=>{
  assert.match(script,/--host 127\.0\.0\.1 --port \$FABRIC_PORT/);
  assert.match(script,/reverse_proxy 127\.0\.0\.1:8787/);
  assert.doesNotMatch(script,/--host 0\.0\.0\.0 --port 8787/);
});

test('owned edge installer maps ChromeOS-safe high ports for public 80 and 443',()=>{
  assert.match(script,/HTTP_PORT="18080"/);
  assert.match(script,/HTTPS_PORT="8443"/);
  assert.match(script,/http_port 18080/);
  assert.match(script,/https_port 8443/);
});

test('owned edge installer persists Fabric and TLS edge under systemd',()=>{
  assert.match(script,/evercraft-fabric\.service/);
  assert.match(script,/evercraft-public-edge\.service/);
  assert.match(script,/Restart=always/);
  assert.match(script,/systemctl enable --now evercraft-fabric\.service/);
  assert.match(script,/systemctl enable --now evercraft-public-edge\.service/);
});

test('OpenAI verification token helper is secret-prompted and validated',()=>{
  assert.match(script,/read -r -s -p "Paste OpenAI domain verification token/);
  assert.match(script,/\[A-Za-z0-9_-\]\{16,512\}/);
  assert.match(script,/chmod 0600/);
  assert.match(script,/awk -F= '\$1 != "EVERCRAFT_OPENAI_CHALLENGE_TOKEN"/);
});

test('owned edge wires public nonce attestation to the local NodeSeed identity without exposing secrets',()=>{
  assert.match(script,/EVERCRAFT_EDGE_NODE_RECEIPT=\$NODE_RECEIPT/);
  assert.match(script,/EVERCRAFT_EDGE_ALLOCATOR_TOKEN_FILE=\$ALLOCATOR_TOKEN_FILE/);
  assert.match(script,/\.local\/state\/evercraft\/organism\/compute\/nodeseed-receipt\.json/);
  assert.match(script,/\.local\/state\/evercraft\/organism\/\.secrets\/allocator-token/);
});


test('Fabric self updater accepts only the authorized Forge repository and fast-forward history',()=>{
  assert.match(updater,/jgaethle10\/forge-operator/);
  assert.match(updater,/status --porcelain/);
  assert.match(updater,/merge-base --is-ancestor/);
  assert.match(updater,/merge --ff-only/);
  assert.doesNotMatch(updater,/git reset --hard origin\/main/);
});

test('Fabric self updater proves the release, self-heals attestation wiring, and rolls back failed runtime verification',()=>{
  assert.match(updater,/npm run test:fabric-directory/);
  assert.match(updater,/npm run test:fabric-local/);
  assert.match(updater,/tests\/fabric-edge-attestation\.test\.mjs/);
  assert.match(updater,/npm run proof:specialist-handoff-yard/);
  assert.match(updater,/reconcile_edge_attestation_env/);
  assert.match(updater,/EVERCRAFT_EDGE_NODE_RECEIPT/);
  assert.match(updater,/EVERCRAFT_EDGE_ALLOCATOR_TOKEN_FILE/);
  assert.match(updater,/verify_edge_attestation_local/);
  assert.match(updater,/verifyNodeAttestation/);
  assert.match(updater,/systemctl restart "\$SERVICE"/);
  assert.match(updater,/rollback "runtime_verification_failed_\$code"/);
  assert.match(updater,/restore_edge_attestation_env/);
  assert.match(updater,/capability_count/);
});

test('Fabric self updater reasserts owned ingress without claiming ChromeOS host control',()=>{
  assert.match(updater,/reassert_owned_public_ingress/);
  assert.match(updater,/evercraft-public-edge\.service/);
  assert.match(updater,/evercraft-router-map\.service/);
  assert.match(updater,/evercraft-router-map\.timer/);
  assert.match(updater,/systemctl enable --now "\$ROUTER_MAP_TIMER"/);
  assert.match(updater,/systemctl start "\$ROUTER_MAP_SERVICE"/);
  assert.doesNotMatch(updater,/\bvmc\b|ChromeOS Settings|\bcrosh\b|chromeos-port-forward/i);
});

test('Fabric self updater can reconstruct only the bounded router mapper from saved approved config',()=>{
  assert.match(updater,/ensure_router_map_resident_from_saved_config/);
  assert.match(updater,/ROUTER_MAP_ENV="\/etc\/evercraft\/router-map\.env"/);
  assert.match(updater,/EVERCRAFT_ROUTER_GATEWAY/);
  assert.match(updater,/EVERCRAFT_ROUTER_LAN_HOST/);
  assert.match(updater,/install-fabric-router-map-resident\.sh/);
  assert.match(updater,/SUDO_USER="\$RUN_USER" bash "\$ROUTER_MAP_INSTALLER"/);
  assert.match(routerMapInstaller,/WAN 80  -> Chromebook 18080/);
  assert.match(routerMapInstaller,/WAN 443 -> Chromebook 8443/);
  assert.match(routerMapper,/external: 80, internal: 18080/);
  assert.match(routerMapper,/external: 443, internal: 8443/);
  assert.doesNotMatch(routerMapper,/external:\s*(22|3389|8787|3000)/);
});


test('Fabric self update timer creates no inbound admin surface and runs on a bounded cadence',()=>{
  assert.match(updaterInstaller,/OnUnitActiveSec=\$CADENCE/);
  assert.match(updaterInstaller,/evercraft-fabric-update\.service/);
  assert.match(updaterInstaller,/NoNewPrivileges=true/);
  assert.doesNotMatch(updaterInstaller,/ListenStream|ssh|sshd|0\.0\.0\.0/);
});


test('owned edge installs a resident read-only network observer',()=>{
  assert.match(script,/install-fabric-network-observer\.sh/);
  assert.match(networkObserverInstaller,/evercraft-network-observer\.service/);
  assert.match(networkObserverInstaller,/evercraft-network-observer\.timer/);
  assert.match(networkObserverInstaller,/OnUnitActiveSec=\$CADENCE/);
  assert.match(networkObserverInstaller,/network-observer\.mjs --out/);
  assert.doesNotMatch(networkObserverInstaller,/AddPortMapping|iptables|nft add|ListenStream/);
});

test('owned edge validates Caddy with the same public-edge environment used by systemd',()=>{
  assert.match(script,/\. \/etc\/evercraft\/public-edge\.env/);
  assert.match(script,/caddy validate --config \/etc\/evercraft\/Caddyfile/);
});

test('self updater proves Remote Operator telemetry and keeps the observer resident',()=>{
  assert.match(updater,/npm run test:remote-operator/);
  assert.match(updater,/install-fabric-network-observer\.sh/);
  assert.match(updater,/evercraft-network-observer\.timer/);
});


test('Fabric self updater prefers a configured outbound relay before bounded router recovery',()=>{
  assert.match(updater,/OUTBOUND_RELAY_SERVICE="evercraft-fabric-outbound-relay\.service"/);
  assert.match(updater,/OUTBOUND_RELAY_ENV="\/etc\/evercraft\/outbound-relay\.env"/);
  assert.match(updater,/systemctl restart "\$OUTBOUND_RELAY_SERVICE"/);
  assert.match(updater,/outbound_relay=\$relay_state/);
});

test('Fabric doctor can route around an unavailable ChromeOS host forward with an active outbound relay',()=>{
  const doctor=fs.readFileSync(new URL('../scripts/fabric-edge-doctor.sh',import.meta.url),'utf8');
  assert.match(doctor,/RELAY_SERVICE=evercraft-fabric-outbound-relay\.service/);
  assert.match(doctor,/ingress_transport="outbound_service_relay"/);
  assert.match(doctor,/diagnosis="local_edge_path_ready_external_canary_required"/);
  assert.match(doctor,/outbound_relay_service/);
});

test('edge installer and updater shell remain syntactically valid',()=>{
  for(const rel of [
    '../scripts/install-fabric-owned-edge.sh',
    '../scripts/install-fabric-network-observer.sh',
    '../scripts/install-fabric-router-map-resident.sh',
    '../scripts/update-fabric-owned-edge.sh',
    '../scripts/install-fabric-outbound-relay.sh',
    '../scripts/install-fabric-relay-node.sh',
  ]){
    const file=new URL(rel,import.meta.url);
    execFileSync('bash',['-n',file.pathname],{stdio:'pipe'});
  }
});
