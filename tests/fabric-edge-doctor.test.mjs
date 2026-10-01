import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const doctor=fs.readFileSync(new URL('../scripts/fabric-edge-doctor.sh',import.meta.url),'utf8');

test('Fabric edge doctor repairs missing local organism identity before diagnosing public edge',()=>{
  assert.match(doctor,/ensure_local_organism/);
  assert.match(doctor,/install-local-organism-user\.sh/);
  assert.match(doctor,/nodeseed-receipt\.json/);
  assert.match(doctor,/allocator-token/);
  assert.match(doctor,/local_organism_repair_failed/);
});

test('Fabric edge doctor installs and enables the resident updater',()=>{
  assert.match(doctor,/ensure_fabric_update_timer/);
  assert.match(doctor,/install-fabric-self-update\.sh/);
  assert.match(doctor,/--cadence 5min/);
  assert.match(doctor,/evercraft-fabric-update\.timer/);
  assert.match(doctor,/fabric_update_repair_failed/);
});

test('Fabric edge doctor holds only at the ChromeOS boundary when forwarded ports are absent',()=>{
  assert.match(doctor,/HTTP_PORT=18080/);
  assert.match(doctor,/HTTPS_PORT=8443/);
  assert.match(doctor,/chromeos_host_forward_unreachable/);
  assert.match(doctor,/human_gate=true/);
});

test('Fabric edge doctor preserves external verification as the final gate',()=>{
  assert.match(doctor,/local_edge_path_ready_external_canary_required/);
  assert.match(doctor,/dns_ipv4/);
  assert.match(doctor,/public_ipv4_seen_inside/);
});
