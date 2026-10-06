import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const installer=fs.readFileSync('scripts/install-fabric-self-update.sh','utf8');
const updater=fs.readFileSync('scripts/update-fabric-owned-edge.sh','utf8');

test('Fabric self-updater keeps home read-only but explicitly admits its Forge checkout for writes',()=>{
  assert.match(installer,/ProtectHome=read-only/);
  assert.match(installer,/ReadWritePaths=\$REPO_ROOT/);
  assert.match(installer,/NoNewPrivileges=true/);
  assert.match(installer,/PrivateTmp=true/);
});

test('Fabric updater still fails closed on dirty or non-fast-forward source',()=>{
  assert.match(updater,/status --porcelain/);
  assert.match(updater,/checkout is dirty; refusing unattended update/);
  assert.match(updater,/merge-base --is-ancestor/);
  assert.match(updater,/remote branch is not a fast-forward/);
  assert.match(updater,/merge --ff-only/);
});

test('Fabric updater still proves runtime before accepting the revision',()=>{
  assert.match(updater,/npm run test:fabric-directory/);
  assert.match(updater,/npm run test:fabric-local/);
  assert.match(updater,/npm run test:remote-operator/);
  assert.match(updater,/verify_current_runtime/);
  assert.match(updater,/rollback "proof_failed"/);
  assert.match(updater,/rollback "runtime_verification_failed_/);
});
