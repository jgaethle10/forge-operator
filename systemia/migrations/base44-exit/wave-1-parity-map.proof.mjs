#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const parity=JSON.parse(fs.readFileSync(
  path.join(root,'systemia/migrations/base44-exit/wave-1-parity-map-2026-10-01.json'),
  'utf8'
));
const profile=JSON.parse(fs.readFileSync(
  path.join(root,'systemia/migrations/base44-exit/wave-1-source-profile-2026-09-30.json'),
  'utf8'
));
const estate=JSON.parse(fs.readFileSync(
  path.join(root,'systemia/migrations/base44-exit/estate-snapshot.json'),
  'utf8'
));

assert.equal(parity.schema,'evercraft.base44.wave-parity-map.v1');
assert.equal(parity.wave,1);
assert.equal(parity.products.length,5);
assert.equal(parity.counts.products,5);
assert.equal(parity.counts.products_with_owned_components,5);
assert.equal(parity.counts.products_locally_proved,5);
assert.equal(parity.counts.products_cutover_ready,0);

const profileNames=new Set((profile.products||[]).map((row)=>row.product));
const queueNames=new Set((estate.queue||[]).filter((row)=>Number(row.wave)===1).map((row)=>row.product));
assert.deepEqual([...profileNames].sort(),[...queueNames].sort());
assert.deepEqual(
  (parity.products||[]).map((row)=>row.product).sort(),
  [...queueNames].sort()
);

for(const product of parity.products){
  assert.equal(product.implementation_state,'owned_components_present');
  assert.match(product.local_proof_state,/proved_local|proved_by_shared_component_suite/);
  assert.ok(product.source_surfaces.length>0);
  assert.ok(product.owned_replacements.length>0);
  assert.ok(product.remaining_gates.includes('explicit_cutover_receipt'));
  assert.equal(product.remaining_gates.includes('source_decommission'),false);

  for(const relative of product.owned_replacements){
    const resolved=path.resolve(root,relative);
    assert.ok(resolved.startsWith(root+path.sep));
    assert.equal(fs.existsSync(resolved),true,'missing owned replacement '+relative);
  }
}

for(const key of [
  'source_mutation','source_decommission','traffic_cutover',
  'dns_mutation','provider_reauthorization','payment_creation'
]){
  assert.equal(parity.authority[key],false);
}

const workforce=parity.products.find((row)=>row.product==='Evercraft AI Workforce');
assert.ok(workforce.remaining_gates.includes('polar_provider_reauthorization'));
assert.ok(workforce.remaining_gates.includes('connector_scope_parity_receipt'));

const audit=parity.products.find((row)=>row.product==='Systemia Audit Center');
assert.ok(audit.remaining_gates.includes('stripe_webhook_endpoint_repoint'));
assert.ok(audit.remaining_gates.includes('pdf_renderer_production_binding'));

const remote=parity.products.find((row)=>row.product==='Systemia Remote Ops');
assert.ok(remote.remaining_gates.includes('voice_provider_webhook_repoint'));
assert.ok(remote.remaining_gates.includes('auto_clock_out_activation_receipt'));

console.log(JSON.stringify({
  schema:'evercraft.base44.wave-1-parity-map-proof.v1',
  status:'pass',
  products:parity.products.length,
  owned_replacement_files_verified:true,
  local_proof_not_cutover:true,
  provider_rebind_gates_preserved:true,
  scheduler_activation_gates_preserved:true,
  products_cutover_ready:0
}));
