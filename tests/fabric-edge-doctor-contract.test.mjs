import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script=fs.readFileSync('scripts/fabric-edge-doctor.sh','utf8');

test('Fabric edge doctor keeps the ChromeOS field gate narrow and explicit',()=>{
  for(const required of [
    'HTTP_PORT=18080',
    'HTTPS_PORT=8443',
    'chromeos_host_forward_unreachable',
    'field_action="chromeos_linux_port_forwarding"',
    'ChromeOS Settings -> Developers -> Linux development environment -> Port forwarding',
    'TCP 18080',
    'TCP 8443',
    '--repair --trigger-canary',
    '"required_chromeos_port_forwards"',
    '"human_gate"',
  ]){
    assert.ok(script.includes(required),'missing field-gate contract: '+required);
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
