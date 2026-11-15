import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadMultiplicationRegistry,resolveMultiplicationContract,loadWorkItems,
  buildMultiplicationPlan,executeMultiplicationPlan
} from '../systemia/saban/multiplier.mjs';
import {runRegisteredAssignment} from '../systemia/saban/registered-worker.mjs';
import {runAssignment,reconcile} from '../systemia/saban/community-radio-preflight-adapter.mjs';

const rootDir=process.cwd();
const source=()=>({
  role:'field_receipt_guard',agent_id:'saban-radio-proof',
  idempotency_key:'sha256:'+'a'.repeat(64),
  work:{kind:'community_radio_preflight',key:'synthetic-field-acceptance-only'},
  item:{raw:{scenario:'synthetic_only'}}
});
test('Saban only admits registered, bounded radio preflight roles and no side effects',()=>{
  const contract=resolveMultiplicationContract('community-radio-preflight',loadMultiplicationRegistry());
  assert.equal(contract.max_logical_agents,4);
  assert.equal(contract.max_physical_workers,2);
  assert.equal(contract.side_effects.external_network,false);
  assert.equal(contract.side_effects.hardware_enrollment,false);
  assert.equal(contract.side_effects.rf_transmission,false);
  assert.equal(contract.side_effects.eas_actions,false);
});
test('registered Saban worker reviews synthetic-only mission with honest physical hold',async()=>{
  const r=await runRegisteredAssignment({software:'community-radio-preflight',assignment:source(),rootDir});
  assert.equal(r.software_id,'community-radio-preflight');
  assert.equal(r.result.review_state,'held_pending_authorized_physical_test');
  assert.equal(r.result.result.independently_field_verified,false);
  assert.equal(r.result.no_customer_hardware_touched,true);
  assert.equal(r.result.no_external_network_calls,true);
});
test('unregistered role and non-synthetic work fail before device actions',async()=>{
  await assert.rejects(()=>runAssignment({assignment:{...source(),role:'remote_shell'},rootDir}),/unregistered_radio_preflight_role/);
  await assert.rejects(()=>runAssignment({assignment:{...source(),item:{raw:{scenario:'production_station'}}},rootDir}),/synthetic_only_radio_preflight_required/);
});
test('Saban reconciliation refuses to claim a real field trial even when all four reviews exist',async()=>{
  const roles=['station_boundary_guard','device_authorization_guard','source_integrity_guard','field_receipt_guard'];
  const rows=await Promise.all(roles.map(role=>runAssignment({assignment:{...source(),role},rootDir})));
  const report=await reconcile({results:rows});
  assert.equal(report.status,'held_pending_authorized_physical_test');
  assert.equal(report.completed_roles.length,4);
  assert.equal(report.actual_node_access_confirmed,false);
  assert.equal(report.physical_two_device_test_completed,false);
  assert.equal(report.side_effects_executed,0);
});
test('actual Saban multiplier schedules four bounded reviews, reconciles, never asserts deployment',async()=>{
  const contract=resolveMultiplicationContract('community-radio-preflight',loadMultiplicationRegistry());
  const workItems=loadWorkItems(contract,rootDir);
  assert.equal(workItems.length,1);
  const plan=buildMultiplicationPlan({contract,logicalAgents:4,physicalWorkers:2,workItems});
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'saban-radio-field-preflight-'));
  try{
    const receipt=await executeMultiplicationPlan({contract,plan,workItems,rootDir,reconcile:true,statePath:path.join(tmp,'saban-state.json')});
    assert.equal(receipt.software_id,'community-radio-preflight');
    assert.equal(receipt.logical_agents,4);
    assert.equal(receipt.reconciliation.status,'held_pending_authorized_physical_test');
    assert.equal(receipt.reconciliation.physical_two_device_test_completed,false);
    assert.equal(receipt.reconciliation.side_effects_executed,0);
    assert.equal(receipt.quality.status,'pass');
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});
