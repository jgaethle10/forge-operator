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

test('Fabric updater fails closed on source changes while ignoring generated artifacts',()=>{
  assert.match(updater,/status --porcelain --untracked-files=all/);
  // The previous grep-based untracked-file exclusion was superseded by the
  // shared classifier; require that fail-closed source protection remains wired.
  assert.match(updater,/classify-fabric-checkout-dirt\.mjs/);
  assert.match(updater,/as_user node "\$DIRT_CLASSIFIER" --blocking-lines/);
  assert.match(updater,/as_user node "\$DIRT_CLASSIFIER" --journal-dirty/);
  assert.match(updater,/if \[\[ -n "\$blocking_dirty" \]\]/);
  assert.match(updater,/checkout-drift classifier missing; refusing unattended update/);
  assert.match(updater,/checkout has source changes; refusing unattended update/);
  assert.match(updater,/ignoring generated artifacts\/ entries in checkout preflight/);
  assert.match(updater,/merge-base --is-ancestor/);
  assert.match(updater,/remote branch is not a fast-forward/);
  assert.match(updater,/merge --ff-only/);
});

test('unattended Fabric update preserves all tracked and untracked Journal changes before fetch',()=>{
  const status=updater.indexOf('dirty_status="$(as_user git -C "$REPO_ROOT" status --porcelain --untracked-files=all)"');
  const guard=updater.indexOf('HOLD: local Journal work is present; preserved without automated restore/clean');
  const fetch=updater.indexOf('fetch --prune "$REMOTE" "$BRANCH"');
  assert.ok(status>=0&&guard>status&&fetch>guard,
    'source status and Journal hold must precede any Git fetch/merge');
  assert.match(updater,/if \[\[ "\$journal_dirty" == "true" \]\]; then/);
  assert.match(updater,/exit 4/);
  assert.equal(updater.includes('restore --staged --worktree -- public/journal'),false,
    'never discard locally modified tracked Journal files');
  assert.equal(updater.includes('clean -fdx -- public/journal'),false,
    'never delete ignored or untracked Journal files');
});

test('rollback rejects changes generated after the initial clean gate',()=>{
  const start=updater.indexOf('rollback() {');
  const end=updater.indexOf('as_user git -C "$REPO_ROOT" merge --ff-only',start);
  assert.ok(start>=0&&end>start);
  const rollback=updater.slice(start,end);
  assert.match(rollback,/rollback_dirty=.*status --porcelain --untracked-files=all/);
  assert.match(rollback,/--blocking-lines/);
  assert.match(rollback,/--journal-dirty/);
  const hold=rollback.indexOf('rollback reset refused to preserve owner files');
  const reset=rollback.indexOf('reset --hard "$before"');
  assert.ok(hold>=0&&reset>hold,'rollback must refuse a destructive reset on unexpected files');
});

test('Fabric updater still proves runtime before accepting the revision',()=>{
  assert.match(updater,/npm run test:fabric-directory/);
  assert.match(updater,/npm run test:fabric-local/);
  assert.match(updater,/npm run test:remote-operator/);
  assert.match(updater,/verify_current_runtime/);
  assert.match(updater,/rollback "proof_failed"/);
  assert.match(updater,/rollback "runtime_verification_failed_/);
});

test('Fabric updater retries transient local edge attestation before rollback',()=>{
  assert.match(updater,/for attempt in 1 2 3 4 5 6/);
  assert.match(updater,/verify_edge_attestation_local/);
  assert.match(updater,/edge attestation not ready yet/);
  assert.match(updater,/sleep 2/);
  assert.match(updater,/return 10/);
});

