import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {loadFabricCatalogFromRepository} from '../systemia/mcp/fabric-directory.mjs';
import {nativeOnlyCatalog} from '../systemia/mcp/fabric-local-runtime.mjs';

const raw=JSON.parse(fs.readFileSync('public/chum/capabilities.json','utf8'));
const updater=fs.readFileSync('scripts/update-fabric-owned-edge.sh','utf8');

test('exact resident capability count includes source-owned discovery supplements',()=>{
  const rawCount=raw.capabilities.length;
  const enriched=loadFabricCatalogFromRepository();
  const publicCount=nativeOnlyCatalog(enriched).capabilities.length;
  assert.ok(publicCount>=rawCount);
  assert.ok(publicCount>0);
  // Regression for the rollback on Oct 30: the raw count was 54 while the
  // actual resident catalog had 55 because the Work Saban pilot is supplemental.
  const supplemental=JSON.parse(fs.readFileSync('systemia/mcp/fabric-catalog-supplements.json','utf8'));
  const base=new Set(raw.capabilities.map(c=>c.public_id));
  const onlySupplemented=(supplemental.capabilities||[]).filter(c=>!base.has(c.public_id));
  assert.ok(onlySupplemented.length>0,'test assumes a real supplemental discovery door');
  assert.ok(publicCount>=rawCount+onlySupplemented.length);
  assert.equal(new Set(enriched.map(c=>c.public_id)).size,enriched.length);
});

test('updater derives count from the same runtime and directory as /health',()=>{
  const start=updater.indexOf('expected_count_for_current() {');
  const end=updater.indexOf('\n}',start)+2;
  assert.ok(start>=0&&end>start);
  const block=updater.slice(start,end);
  assert.match(block,/loadFabricCatalogFromRepository\(\)/);
  assert.match(block,/nativeOnlyCatalog\(/);
  assert.match(block,/process\.stdout\.write\(String\(count\)\)/);
  assert.doesNotMatch(block,/JSON\.parse\(fs\.readFileSync|x\.capabilities\|\|\[\]/);
  assert.match(updater,/verify_current_runtime "\$expected_count" "\$target"/);
  assert.match(updater,/rollback "runtime_verification_failed_\$code"/);
});

test('health check logs a safe reason but keeps strong guard and rollback',()=>{
  assert.match(updater,/reject\('capability_count_expected_/);
  assert.match(updater,/reject\('source_release_ref',10\)/);
  assert.match(updater,/reject\('visual_desk_ingest_ready',6\)/);
  assert.match(updater,/reject\('earthworks_simulator_authority',9\)/);
  assert.doesNotMatch(updater,/console\.error\(process\.env\.HEALTH_JSON/);
});

test('updater bash syntax is valid',()=>{
  const result=spawnSync('bash',['-n','scripts/update-fabric-owned-edge.sh'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
