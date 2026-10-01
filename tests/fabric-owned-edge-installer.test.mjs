import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script=fs.readFileSync(new URL('../scripts/install-fabric-owned-edge.sh',import.meta.url),'utf8');
const updater=fs.readFileSync(new URL('../scripts/update-fabric-owned-edge.sh',import.meta.url),'utf8');
const updaterInstaller=fs.readFileSync(new URL('../scripts/install-fabric-self-update.sh',import.meta.url),'utf8');

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

test('Fabric self update timer creates no inbound admin surface and runs on a bounded cadence',()=>{
  assert.match(updaterInstaller,/OnUnitActiveSec=\$CADENCE/);
  assert.match(updaterInstaller,/evercraft-fabric-update\.service/);
  assert.match(updaterInstaller,/NoNewPrivileges=true/);
  assert.doesNotMatch(updaterInstaller,/ListenStream|ssh|sshd|0\.0\.0\.0/);
});
