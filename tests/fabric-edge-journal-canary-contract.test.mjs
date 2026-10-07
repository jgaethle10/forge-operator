import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const canary=fs.readFileSync(new URL('../scripts/fabric-edge-external-canary.mjs',import.meta.url),'utf8');

test('production edge canary treats Journal canonical identity as a first-class stage',()=>{
  assert.match(canary,/checks\.journal_surface!==true/);
  assert.match(canary,/return 'journal_surface'/);
  assert.match(canary,/\/journal\/index\.json/);
  assert.match(canary,/journal_index_canonical_origin_drift/);
});

test('production edge canary binds live Journal article to Fabric canonical, OG and story identity',()=>{
  assert.match(canary,/origin\+'\/journal\/'\+journalSlug\+'\/'/);
  assert.match(canary,/evercraft:story_id/);
  assert.match(canary,/rel="canonical"/);
  assert.match(canary,/property="og:url"/);
  assert.match(canary,/journal_article_story_id_drift/);
  assert.match(canary,/journal_article_canonical_drift/);
  assert.match(canary,/journal_article_og_url_drift/);
});

test('production edge canary explicitly rejects the dead legacy Journal canonical domain',()=>{
  assert.match(canary,/journal\\\.evercraft\\\.global/);
  assert.match(canary,/journal_dead_canonical_domain_regressed/);
  assert.match(canary,/dead_canonical_domain_absent:true/);
});
