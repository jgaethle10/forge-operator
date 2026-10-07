import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const rescue=fs.readFileSync(new URL('../scripts/rescue-fabric-journal-edge.sh',import.meta.url),'utf8');

test('Journal rescue is scoped to the authorized Forge repository',()=>{
  assert.match(rescue,/jgaethle10\/forge-operator/);
  assert.match(rescue,/remote get-url "\$REMOTE"/);
  assert.match(rescue,/refusing recovery because origin is not the authorized Forge repository/);
});

test('Journal rescue only discards generated public\/journal and never hard-resets source',()=>{
  assert.match(rescue,/restore --staged --worktree -- public\/journal/);
  assert.match(rescue,/clean -fdx -- public\/journal/);
  assert.doesNotMatch(rescue,/git .*reset --hard/);
  assert.doesNotMatch(rescue,/clean -fdx(?! -- public\/journal)/);
});

test('Journal rescue refuses real source changes after generated output normalization',()=>{
  const normalize=rescue.indexOf('restore --staged --worktree -- public/journal');
  const status=rescue.indexOf('status --porcelain --untracked-files=all');
  const hold=rescue.indexOf('real source changes remain after Journal normalization');
  assert.ok(normalize>=0&&status>=0&&hold>=0);
  assert.ok(normalize<status);
  assert.ok(status<hold);
});

test('Journal rescue permits only fast-forward recovery and verifies the local Journal afterwards',()=>{
  assert.match(rescue,/merge-base --is-ancestor/);
  assert.match(rescue,/merge --ff-only/);
  assert.match(rescue,/systemctl restart "\$SERVICE"/);
  assert.match(rescue,/http:\/\/127\.0\.0\.1:8787\/health/);
  assert.match(rescue,/http:\/\/127\.0\.0\.1:8787\/journal\/index\.json/);
  assert.match(rescue,/journal_mirror_ready!==true/);
  assert.match(rescue,/https:\/\/fabric\.systemiacommandcenters\.com\/journal/);
});

test('Journal rescue leaves an auditable receipt and reinstalls the hardened updater',()=>{
  assert.match(rescue,/install-fabric-self-update\.sh/);
  assert.match(rescue,/--cadence 5min/);
  assert.match(rescue,/evercraft\.fabric-journal-rescue\.v1/);
  assert.match(rescue,/source_changes_discarded":false/);
  assert.match(rescue,/generated_journal_reconciled":true/);
});
