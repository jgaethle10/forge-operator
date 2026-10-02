import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script=fs.readFileSync('scripts/fabric-edge-doctor.sh','utf8');

test('Fabric edge doctor proves Linux listeners before interpreting ChromeOS forwarding',()=>{
  for(const required of [
    'HTTP_PORT=18080',
    'HTTPS_PORT=8443',
    'local_edge_http_ok=false',
    'local_edge_https_ok=false',
    'tcp_probe 127.0.0.1 "$HTTP_PORT"',
    'tcp_probe 127.0.0.1 "$HTTPS_PORT"',
    'public_edge_listener_unreachable',
    '[Linux public-edge listener probes]',
    'do not change ChromeOS port settings',
    'lan_forward_probe_authoritative":false',
  ]){
    assert.ok(script.includes(required),'missing listener-first contract: '+required);
  }
});

test('Fabric edge doctor triggers the external canary only after local readiness',()=>{
  assert.ok(script.includes('TRIGGER_CANARY=false'));
  assert.ok(script.includes('--trigger-canary'));
  assert.ok(script.includes('local_edge_path_ready_external_canary_required'));
  assert.ok(script.includes('blocked_until_local_edge_ready'));
  assert.ok(script.includes('gh workflow run "$CANARY_WORKFLOW" --repo "$CANARY_REPO"'));
  assert.ok(script.includes('external_canary_trigger_state'));
  assert.ok(script.includes('external_canary_trigger_ok'));
});

test('Fabric edge doctor preserves human-gate exit semantics',()=>{
  assert.ok(script.includes('if [[ "$human_gate" == "true" ]]; then'));
  assert.ok(script.includes('exit 20'));
  assert.ok(script.includes('if [[ "$diagnosis" != "local_edge_path_ready_external_canary_required" ]]; then'));
  assert.ok(script.includes('exit 10'));
});


test('Fabric edge recovery is not blocked by optional Saban maintenance',()=>{
  assert.ok(script.includes('MAINTAIN_SABAN=false'));
  assert.ok(script.includes('--maintain-saban'));
  assert.ok(script.includes('Saban maintenance is intentionally NOT part of edge recovery'));
  const edgeRestart=script.indexOf('systemctl restart evercraft-public-edge.service');
  const sabanMaintenance=script.indexOf('if [[ "$MAINTAIN_SABAN" == "true" ]]');
  assert.ok(edgeRestart>=0,'missing public edge restart');
  assert.ok(sabanMaintenance>edgeRestart,'Saban maintenance must happen after edge restart');
  const diagnosisBlock=script.slice(
    script.indexOf('diagnosis="unknown"'),
    script.indexOf('echo\necho "[diagnosis]"')
  );
  assert.equal(diagnosisBlock.includes('saban_capacity_repair_failed'),false);
  assert.ok(script.includes('"saban_maintenance_requested"'));
  assert.ok(script.includes('"saban_capacity_degraded"'));
});


test('Fabric edge doctor does not let updater maintenance mask ingress diagnosis',()=>{
  assert.ok(script.includes('self_update_degraded=false'));
  assert.ok(script.includes('WARNING: verified self-updater is degraded'));
  const diagnosisBlock=script.slice(
    script.indexOf('diagnosis="unknown"'),
    script.indexOf('echo\necho "[diagnosis]"')
  );
  assert.equal(diagnosisBlock.includes('fabric_update_repair_failed'),false);
  assert.ok(diagnosisBlock.includes('public_edge_listener_unreachable'));
  assert.ok(script.includes('"self_update_degraded"'));
});

test('Fabric edge doctor repairs router-map env readability before unprivileged refresh',()=>{
  const sourceIndex=script.indexOf('source "$ROUTER_ENV"');
  const chmodIndex=script.lastIndexOf('chmod 0644 "$ROUTER_ENV"',sourceIndex);
  assert.ok(chmodIndex>=0,'missing router env readability repair');
  assert.ok(chmodIndex<sourceIndex,'router env mode must be repaired before sourcing');
  assert.ok(script.includes('runuser -u "$RUN_USER" -- /usr/local/sbin/evercraft-refresh-router-map'));
});


test('Fabric edge doctor repairs router-map directory traversal before unprivileged refresh',()=>{
  const sourceIndex=script.indexOf('source "$ROUTER_ENV"');
  const dirChmod=script.lastIndexOf('chmod 0755 "$(dirname "$ROUTER_ENV")"',sourceIndex);
  const fileChmod=script.lastIndexOf('chmod 0644 "$ROUTER_ENV"',sourceIndex);
  assert.ok(dirChmod>=0,'missing router env directory traversal repair');
  assert.ok(fileChmod>dirChmod,'file readability repair should follow directory traversal repair');
  assert.ok(sourceIndex>fileChmod,'router env must be repaired before sourcing');
});

test('Fabric edge doctor treats Crostini-to-ChromeOS LAN self-probe as advisory',()=>{
  assert.match(script,/hairpin\/self-reflection can fail/);
  assert.match(script,/Authoritative ingress state comes from the independent external canary/);
  const diagnosisBlock=script.slice(
    script.indexOf('diagnosis="unknown"'),
    script.indexOf('echo\necho "[diagnosis]"')
  );
  assert.equal(diagnosisBlock.includes('chromeos_host_forward_unreachable'),false);
});
