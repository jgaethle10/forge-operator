import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const rescue=fs.readFileSync(new URL('../scripts/rescue-fabric-journal-edge.sh',import.meta.url),'utf8');

test('Journal rescue is scoped to authorized Forge repository',()=>{
  assert.match(rescue,/jgaethle10\/forge-operator/);
  assert.match(rescue,/remote get-url "\$REMOTE"/);
  assert.match(rescue,/refusing recovery because origin is not the authorized Forge repository/);
});

test('Journal rescue preserves tracked, untracked and ignored publication evidence',()=>{
  assert.doesNotMatch(rescue,/\bgit -C "\$REPO_ROOT" (?:restore|clean)[^\n]*public\/journal/);
  assert.doesNotMatch(rescue,/git .*reset --hard/);
  assert.match(rescue,/status --porcelain --untracked-files=all/);
  assert.match(rescue,/ls-files --others --ignored --exclude-standard -- public\/journal/);
  assert.match(rescue,/if \[\[ -n "\$journal_ignored" \]\]/);
  assert.match(rescue,/if \[\[ -n "\$blocking" \|\| "\$journal_dirty" == "true" \]\]/);
  assert.match(rescue,/No files were deleted/);
});

test('Journal rescue gates mutation behind evidence and source checks',()=>{
  const journalScan=rescue.indexOf('ls-files --others --ignored');
  const journalHold=rescue.indexOf('HOLD: ignored Journal publication evidence');
  const sourceHold=rescue.indexOf('HOLD: source or Journal evidence is dirty');
  const remoteFetch=rescue.indexOf('fetch --prune "$REMOTE" "$BRANCH"');
  assert.ok(journalScan>=0&&journalHold>journalScan);
  assert.ok(sourceHold>journalHold&&remoteFetch>sourceHold);
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

test('Journal rescue leaves a truthful receipt and reinstalls the hardened updater',()=>{
  assert.match(rescue,/install-fabric-self-update\.sh/);
  assert.match(rescue,/--cadence 5min/);
  assert.match(rescue,/evercraft\.fabric-journal-rescue\.v1/);
  assert.match(rescue,/source_changes_discarded":false/);
  assert.match(rescue,/generated_journal_reconciled":false/);
  assert.match(rescue,/journal_clean_verified":true/);
});
