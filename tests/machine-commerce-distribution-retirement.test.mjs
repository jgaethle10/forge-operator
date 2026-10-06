import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file='distribution/machine-commerce-distribution.json';
const source=fs.readFileSync(file,'utf8');
const doc=JSON.parse(source);

test('Machine Commerce distribution advertises only the verified owned Fabric runtime',()=>{
  assert.doesNotMatch(source,/https?:\/\/[^\s"'\x60<>]*base44\.app/i);
  assert.equal(doc.live_runtime.endpoint,'https://fabric.systemiacommandcenters.com/mcp');
  assert.equal(doc.live_runtime.health,'https://fabric.systemiacommandcenters.com/health');
  assert.equal(doc.live_runtime.state,'owned_fabric_public_https_mcp_verified');
  assert.equal(doc.live_runtime.authority,'receipt_backed_owned_public_runtime');
  assert.equal(doc.live_runtime.base44_runtime_supported,false);
  assert.equal(doc.live_runtime.read_only,true);
  assert.equal(doc.live_runtime.transactional,false);
  assert.match(String(doc.live_runtime.evidence_ref||''),/evercraft-fabric-operator-edge\.json$/);
});

test('historical directory observations remain separate from live runtime authority',()=>{
  for(const row of doc.destinations){
    assert.notEqual(row.state,'verified_live',row.destination);
  }
  const registry=doc.destinations.find((row)=>row.destination==='Official MCP Registry');
  assert.ok(registry);
  assert.equal(registry.state,'legacy_listing_observed_repoint_pending');
  assert.equal(registry.is_latest,false);
  assert.match(String(registry.note||''),/historical/i);
  assert.match(String(registry.note||''),/repoint/i);
});

test('owned runtime proof now precedes provider and revenue receipts',()=>{
  assert.equal(doc.next_milestones[0],'registry_listing_repointed_to_owned_runtime');
  assert.ok(doc.next_milestones.includes('independent_directory_pickup_verified_on_owned_runtime'));
  assert.ok(doc.next_milestones.includes('first_provider_verified_payment'));
  assert.match(doc.truth_boundary,/current externally verified owned universal discovery MCP/i);
  assert.match(doc.truth_boundary,/repointing, pickup, payment and revenue each require their own receipts/i);
});
