#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const map=JSON.parse(fs.readFileSync(
  path.join(root,'systemia/migrations/base44-exit/wave-1-command-center-function-map.json'),
  'utf8'
));

assert.equal(map.schema,'evercraft.base44.command-center-function-map.v1');
assert.equal(map.product,'Systemia Command Center');
assert.equal(map.source_function_count,8);
assert.equal(map.functions.length,8);

const expected=[
  'aqueductOps',
  'evercraftCommerceGateway',
  'evercraftCommerceMcp',
  'evercraftWebGateway',
  'evercraftWebMcp',
  'exactOutputGateOps',
  'firstPartyCapabilityRouter',
  'systemiaCoreGateway'
].sort();
assert.deepEqual(map.functions.map((row)=>row.source_function).sort(),expected);

for(const row of map.functions){
  assert.ok(row.owned_refs.length>0,'missing owned refs for '+row.source_function);
  for(const ref of row.owned_refs){
    const resolved=path.resolve(root,ref);
    assert.ok(resolved.startsWith(root+path.sep));
    assert.equal(fs.existsSync(resolved),true,'missing owned ref '+ref);
  }
  assert.notEqual(row.state,'cutover_ready');
}

const stateful=new Set(['aqueductOps','exactOutputGateOps']);
for(const name of stateful){
  const row=map.functions.find((item)=>item.source_function===name);
  assert.equal(row.state,'owned_implementation_present_ci_pending');
  assert.ok(row.remaining.includes('destination_data_reconciliation'));
  assert.ok(row.remaining.includes('owned_deployment_receipt'));
}

const router=map.functions.find((row)=>row.source_function==='firstPartyCapabilityRouter');
assert.equal(router.state,'owned_implementation_present_ci_pending_data_reconciliation');
assert.ok(router.owned_refs.includes('systemia/capability-router/runtime.mjs'));
assert.ok(router.remaining.includes('live_source_to_destination_reconciliation'));

const publicEdgeRows=map.functions.filter((row)=>Array.isArray(row.legacy_registry_refs));
assert.equal(publicEdgeRows.length,4);
const registryFiles=new Set();
for(const row of publicEdgeRows){
  assert.ok(row.remaining.includes('registry_repoint_after_active_cutover'));
  for(const ref of row.legacy_registry_refs){
    registryFiles.add(ref);
    const text=fs.readFileSync(path.join(root,ref),'utf8');
    assert.match(text,/base44\.app|base44\.app\/api|base44/i);
  }
}
assert.equal(registryFiles.size,4);

assert.equal(map.summary.source_functions,8);
assert.equal(map.summary.stateful_functions_owned_implementation_present,2);
assert.equal(map.summary.owned_function_implementations_present,3);
assert.equal(map.summary.functions_with_owned_replacement_path,8);
assert.equal(map.summary.functions_fully_cutover_ready,0);
assert.equal(map.summary.legacy_public_registry_routes_remaining,4);

for(const key of ['source_mutation','traffic_cutover','registry_repoint','source_decommission']){
  assert.equal(map.authority[key],false);
}

console.log(JSON.stringify({
  schema:'evercraft.base44.command-center-function-map-proof.v1',
  status:'pass',
  source_functions:8,
  stateful_owned_implementations:2,
  owned_replacement_paths:8,
  legacy_registry_files_still_base44:registryFiles.size,
  premature_registry_repoint_detected:false,
  cutover_ready_functions:0
}));
