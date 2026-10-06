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

test('official registry publication is verified while downstream directory observations stay separate',()=>{
  const registry=doc.destinations.find((row)=>row.destination==='Official MCP Registry');
  assert.ok(registry);
  assert.equal(registry.state,'verified_published_owned_runtime');
  assert.equal(registry.version,'1.7.0');
  assert.equal(registry.is_latest,true);
  assert.equal(registry.evidence_ref,'GitHubActionsRun:37499511004');
  assert.match(String(registry.note||''),/successfully published/i);
  assert.match(String(registry.note||''),/fabric\.systemiacommandcenters\.com\/mcp/i);

  for(const row of doc.destinations.filter((row)=>row.destination!=='Official MCP Registry')){
    assert.notEqual(row.state,'verified_live',row.destination);
  }
});

test('registry publication now precedes downstream pickup and revenue receipts',()=>{
  assert.equal(doc.next_milestones[0],'independent_directory_pickup_verified_on_owned_runtime');
  assert.ok(doc.next_milestones.includes('first_non_synthetic_external_tools_call_on_owned_runtime'));
  assert.ok(doc.next_milestones.includes('first_provider_verified_payment'));
  assert.match(doc.truth_boundary,/Official MCP Registry v1\.7\.0 is verified published/i);
  assert.match(doc.truth_boundary,/pickup, tool use, buyer handoff, checkout, payment and revenue remain separate receipt boundaries/i);
});
