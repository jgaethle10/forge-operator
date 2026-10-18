import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildEvacuationPlan, assertNoSecretValues } from './contract.mjs';
const registry=JSON.parse(fs.readFileSync('systemia/saban/multiplication-registry.json','utf8'));
const observed=JSON.parse(fs.readFileSync('systemia/migrations/base44-exit/factory/urgent-schema-snapshot.json','utf8'));
const saban=registry.software.find(row=>row.software_id==='base44-evac');

test('urgent observed estate has four non-empty verified schema metadata summaries, not exported customer records',()=>{
  assert.equal(observed.apps.length,4);
  assert.equal(observed.apps.reduce((s,a)=>s+a.entity_count,0),132);
  assert.equal(new Set(observed.apps.map(a=>a.name)).size,4);
  for(const app of observed.apps){
    assert.equal(app.source_observation,'authenticated_schema_metadata_only');
    assert.equal(app.records_exported,false);
    assert.equal(app.source_code_available,false);
    assert.equal(app.deployed_to_owned_runtime,false);
    assert.equal(Object.keys(app.readiness).length,0);
    assert.equal(buildEvacuationPlan(app).readiness.status,'not_cutover_ready');
  }
});

test('Saban covers all ten roles for every app without production write authority',()=>{
  assert.equal(saban.roles.length,10);
  assert.equal(saban.assignment_strategy,'role_item_cartesian');
  assert.equal(saban.default_logical_agents,40);
  assert.equal(saban.work_sources[0].field,'apps');
  assert.equal(saban.side_effects.source_write,false);
  assert.equal(saban.side_effects.traffic_cutover,false);
  assert.equal(saban.side_effects.dns_mutation,false);
  assert.equal(saban.side_effects.automatic_checkout,false);
  assert.equal(saban.side_effects.credential_copy,false);
});

test('snapshot contains no legacy app IDs, email addresses, cookies or secret fields',()=>{
 const text=JSON.stringify(observed);
 assert.doesNotMatch(text, /@[a-z0-9.-]+\\.[a-z]{2,}|\"(?:app_id|base44_id|password|api_key|token|cookie|private_key)\"\\s*:/i);
 assertNoSecretValues(observed);
});
