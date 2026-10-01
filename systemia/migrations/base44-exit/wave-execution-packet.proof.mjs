#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildWaveExecutionPacket, nextWaveActions, assertWavePacketBoundaries } from './wave-execution-packet.mjs';

const root=process.cwd();
const profile=JSON.parse(fs.readFileSync(path.join(root,'systemia/migrations/base44-exit/wave-1-source-profile-2026-09-30.json'),'utf8'));
const estate=JSON.parse(fs.readFileSync(path.join(root,'systemia/migrations/base44-exit/estate-snapshot.json'),'utf8'));
const policy=JSON.parse(fs.readFileSync(path.join(root,'systemia/migrations/base44-exit/policy.json'),'utf8'));

const packet=buildWaveExecutionPacket({profile,queue:estate.queue,policy});
assertWavePacketBoundaries(packet);

assert.equal(packet.wave,1);
assert.equal(packet.products.length,5);
assert.equal(packet.totals.entity_schemas,157);
assert.equal(packet.totals.server_functions,37);
assert.equal(packet.totals.connected_connectors,1);
assert.deepEqual(packet.missing_shared_landing_primitives,[]);

const command=packet.products.find((row)=>row.product==='Systemia Command Center');
assert.ok(command.execution_stages.some((row)=>row.stage==='machine_surfaces'));
assert.ok(command.execution_stages.some((row)=>row.stage==='cutover'));

const workforce=packet.products.find((row)=>row.product==='Evercraft AI Workforce');
assert.ok(workforce.execution_stages.some((row)=>row.stage==='connectors'));
assert.ok(workforce.execution_stages.some((row)=>row.stage==='commerce'));
assert.equal(workforce.automatic_cutover_allowed,false);

const audit=packet.products.find((row)=>row.product==='Systemia Audit Center');
assert.ok(audit.execution_stages.some((row)=>row.stage==='webhooks'));
assert.ok(audit.execution_stages.some((row)=>row.stage==='object_storage'));
assert.ok(audit.execution_stages.some((row)=>row.stage==='commerce'));

const remote=packet.products.find((row)=>row.product==='Systemia Remote Ops');
assert.ok(remote.execution_stages.some((row)=>row.stage==='scheduled_work'));
assert.ok(remote.execution_stages.some((row)=>row.stage==='webhooks'));

for(const product of packet.products){
  const cutover=product.execution_stages.find((row)=>row.stage==='cutover');
  if(cutover){
    assert.equal(cutover.authority,'separate_explicit_gate');
    assert.ok(cutover.required_evidence.includes('explicit_cutover_authority_receipt'));
  }
  const decommission=product.execution_stages.find((row)=>row.stage==='decommission');
  if(decommission){
    assert.equal(decommission.authority,'separate_human_gate');
    assert.ok(decommission.required_evidence.includes('separate_source_decommission_authority_receipt'));
  }
}

const actions=nextWaveActions(packet);
assert.equal(actions.filter((row)=>row.scope==='shared').length,0);
assert.equal(actions.filter((row)=>row.scope==='product').length,5);
assert.ok(actions.every((row)=>row.stage==='source_capture'));

console.log(JSON.stringify({
  schema:'evercraft.base44.wave-execution-packet-proof.v1',
  status:'pass',
  wave:packet.wave,
  products:packet.products.length,
  entity_schemas:packet.totals.entity_schemas,
  server_functions:packet.totals.server_functions,
  connected_connectors:packet.totals.connected_connectors,
  missing_shared_primitives:packet.missing_shared_landing_primitives.length,
  first_actions:actions.map((row)=>({product:row.product,stage:row.stage})),
  automatic_cutover_allowed:false,
  automatic_decommission_allowed:false
}));
