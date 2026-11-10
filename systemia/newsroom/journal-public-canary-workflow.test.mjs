import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// These contract checks guard a real-world failure mode: the source Journal
// has archives but no approved current edition. Its web delivery may be healthy,
// yet the newsroom must remain red until a fresh article passes release gates.
const workflow=fs.readFileSync(
  new URL('../../.github/workflows/evercraft-journal-public-canary.yml',import.meta.url),'utf8'
);

test('archive-only Journal gets a read-only external diagnostic and cannot be reported as live',()=>{
  const archive=workflow.split('      - name: Independently probe archived Journal delivery without declaring it live')[1]
    ?.split('      - name: Diagnose owned edge Journal state')[0];
  assert.ok(archive,'archive-only diagnostic is missing');
  assert.match(archive,/if: steps\.edition\.outputs\.edition_state == 'archive_only'/);
  assert.match(archive,/journal-edge-readiness\.mjs/);
  assert.match(archive,/verified:false/);
  assert.match(archive,/current_edition_verified:false/);
  assert.match(archive,/archiveVerified\?'archive_only_degraded':'archive_delivery_unverified'/);
});

test('archive-only source does not bypass the live-article gate',()=>{
  const hold=workflow.split('      - name: Enforce live newsroom release gate')[1]
    ?.split('      - name: Preserve Journal edge diagnostics')[0];
  assert.ok(hold,'archive-only must remain a failed production release gate');
  assert.match(hold,/if: always\(\) && steps\.edition\.outputs\.edition_state == 'archive_only'/);
  assert.match(hold,/exit 1/);
  assert.match(workflow,/edition_state=archive_only/);
});

test('live verification remains scoped to current source-approved articles',()=>{
  assert.match(workflow,/if: steps\.edition\.outputs\.edition_state == 'live'/);
  assert.match(workflow,/article_sha256/);
  assert.match(workflow,/machine_evidence_sha256/);
  assert.match(workflow,/external_https_verified:true/);
  assert.match(workflow,/name: Preserve external Journal canary receipt\n        if: always\(\)/);
});
