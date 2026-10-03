import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRepairGraph, repairNavigatorCapability, scoreRepairIntent, triageRepairIntent } from '../systemia/repair/repair-graph.mjs';

test('Repair Graph covers multiple physical repair domains',()=>{
  const graph=loadRepairGraph();
  const domains=new Set(graph.domains.map(x=>x.domain));
  for(const domain of ['automotive','appliance','small_engine','marine','home_electrical']) assert.ok(domains.has(domain));
});

test('headlight wiring complaint routes into automotive repair triage',()=>{
  const q='My headlight is out and I think it might be the wire';
  assert.ok(scoreRepairIntent(q)>0);
  const result=triageRepairIntent(q);
  assert.equal(result.supported,true);
  assert.equal(result.domain,'automotive');
  assert.match(result.problem,/headlight/i);
  assert.ok(result.hypotheses.some(x=>/wiring|connector|bulb/i.test(x.cause)));
  assert.equal(result.diagnosis_is_hypothesis,true);
  assert.equal(result.transactional,false);
  assert.equal(result.external_action_taken,false);
});

test('Repair Graph preserves a safety gate and does not claim fitment or inventory',()=>{
  const result=triageRepairIntent('An outlet in my house has no power');
  assert.equal(result.supported,true);
  assert.equal(result.domain,'home_electrical');
  assert.equal(result.safety.level,'professional_gate');
  assert.equal(result.fitment_proven,false);
  assert.equal(result.inventory_verified,false);
});

test('Repair Navigator capability is free read-only Fabric frontage',()=>{
  const capability=repairNavigatorCapability();
  assert.equal(capability.public_id,'evercraft-repair-navigator-v1');
  assert.equal(capability.state,'read_only_live');
  assert.equal(capability.commercial_state,'free');
  assert.match(capability.action_url,/fabric\.systemiacommandcenters\.com\/repair/);
});
