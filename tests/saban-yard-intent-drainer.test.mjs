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
  const sanitized=runner.indexOf('const safeInventory=writeSafeNodeSeedInventory');
  const drain=runner.indexOf('const drained=await yard.drainSabanNodeSeedIntents');
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

test('unified dispatch is explicitly opt-in, bounded to content hashes, and checks existing ownership',()=>{
  assert.match(installer,/--unified-content-hash-dispatch/);
  assert.match(installer,/--broker-loopback-origin/);
  assert.match(installer,/--dispatch-content-hash-only/);
  assert.match(installer,/--allow-loopback-proof/);
  assert.match(installer,/--max-jobs/);
  assert.match(installer,/Saban state owner differs from Yard runner user/);
  assert.match(installer,/runuser -u "\$RUN_USER" -- test -w "\$YARD_STATE_DIR"/);
  assert.match(installer,/systemctl disable --now evercraft-saban-dispatch\.timer/);
  assert.match(installer,/flock/);
  assert.match(installer,/RESTORE_TIMERS_ON_FAILURE/);
  assert.match(runner,/dispatchQueued:process\.argv\.includes\('--dispatch-content-hash-only'\)/);
  assert.match(runner,/nodeSeedOnly:true/);
  assert.match(runner,/unified_dispatch_requires_explicit_127_0_0_1_broker_origin/);
});
