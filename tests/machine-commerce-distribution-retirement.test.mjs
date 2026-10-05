import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file='distribution/machine-commerce-distribution.json';
const source=fs.readFileSync(file,'utf8');
const doc=JSON.parse(source);

test('Machine Commerce distribution no longer advertises a Base44 runtime',()=>{
  assert.doesNotMatch(source,/https?:\/\/[^\s"'\x60<>]*base44\.app/i);
  assert.equal(doc.live_runtime.endpoint,null);
  assert.equal(doc.live_runtime.health,null);
  assert.equal(doc.live_runtime.state,'legacy_provider_retired_owned_route_pending');
  assert.equal(doc.live_runtime.base44_runtime_supported,false);
});

test('historical directory observations are not labeled live runtime authority',()=>{
  for(const row of doc.destinations){
    assert.notEqual(row.state,'verified_live',row.destination);
  }
  const registry=doc.destinations.find((row)=>row.destination==='Official MCP Registry');
  assert.ok(registry);
  assert.equal(registry.state,'legacy_listing_observed_not_runtime_authority');
  assert.equal(registry.is_latest,false);
});

test('owned runtime proof precedes directory repointing milestones',()=>{
  assert.equal(doc.next_milestones[0],'owned_public_machine_commerce_runtime_verified');
  assert.equal(doc.next_milestones[1],'registry_listing_repointed_to_owned_runtime');
  assert.match(doc.truth_boundary,/advertises no callable Machine Commerce endpoint/);
});
