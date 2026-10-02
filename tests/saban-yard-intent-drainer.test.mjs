import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const installer=fs.readFileSync(
  new URL('../scripts/install-yard-saban-intent-drainer.sh',import.meta.url),
  'utf8'
);
const runner=fs.readFileSync(
  new URL('../systemia/yard/saban-intent-drain-runner.mjs',import.meta.url),
  'utf8'
);

test('resident Yard Saban drainer requires an existing explicit broker deployment',()=>{
  assert.match(installer,/--broker-deployment-id/);
  assert.match(installer,/configured broker deployment does not exist/);
  assert.match(installer,/systemia\.remote-capacity-broker\.v1/);
  assert.doesNotMatch(installer,/deployRelease\(/);
  assert.match(installer,/does NOT deploy a broker/i);
});

test('resident bridge persists no allocator or control authority into Saban configuration',()=>{
  assert.match(installer,/EVERCRAFT_REMOTE_BROKER_DEPLOYMENT_ID=/);
  assert.doesNotMatch(installer,/ALLOCATOR_TOKEN=/);
  assert.doesNotMatch(installer,/CONTROL_TOKEN=/);
  assert.doesNotMatch(installer,/REMOTE_BROKER_TOKEN=/);
  assert.match(runner,/allocator_authority_exposed_to_saban:false/);
  assert.match(runner,/control_authority_exposed_to_saban:false/);
  assert.match(runner,/writeSafeNodeSeedInventory/);
});

test('Yard refreshes safe capacity inventory before draining frozen Saban intents',()=>{
  const inventory=runner.indexOf('listRemoteCapacityNodes');
  const sanitized=runner.indexOf('writeSafeNodeSeedInventory');
  const drain=runner.indexOf('drainSabanNodeSeedIntents');
  assert.ok(inventory>=0);
  assert.ok(sanitized>inventory);
  assert.ok(drain>sanitized);
});

test('resident drainer runs unprivileged with bounded writable state',()=>{
  assert.match(installer,/User=\$RUN_USER/);
  assert.match(installer,/NoNewPrivileges=true/);
  assert.match(installer,/ProtectSystem=full/);
  assert.match(installer,/ProtectHome=read-only/);
  assert.match(installer,/ReadWritePaths=\$YARD_STATE_DIR \$SABAN_STATE_DIR/);
  assert.match(installer,/evercraft-yard-saban-intent-drain\.timer/);
});
