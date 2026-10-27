import test from 'node:test';
import assert from 'node:assert/strict';
import { assessOsRelease } from './release-readiness.mjs';

const program='sha256:'+'a'.repeat(64);
const source=()=>({
  schema:'evercraft.os.parallel-readiness-receipt.v1',
  state:'source_ready',
  logical_assignments_executed_locally:12,
  logical_assignment_limit:12,
  program_sha256:program,
  systemia_policy_evaluated:true,
  systemia_policy:{state:'systemia_policy_plan_admitted',program_sha256:program},
  systemia_policy_matches_reconciled_program:true,
  reconciliation:{status:'reconciled',expected_lanes:12,returned_lanes:12},
  lanes:Array.from({length:12},(_,i)=>({
    lane_id:'lane_'+i,
    source_state:'source_anchors_found',
    runtime_observed:false
  }))
});
const passedAudit=()=>({
  schema:'evercraft.audit.github-workflow-writers.v1',
  ok:true,
  findings:[]
});
test('all-green source and workflow audit STILL deny automatic production release',()=>{
  const r=assessOsRelease({sourceReceipt:source(),writerAudit:passedAudit()});
  assert.equal(r.source_readiness_proven,true);
  assert.equal(r.workflow_writer_audit_passed,true);
  assert.equal(r.state,'held');
  assert.equal(r.deploy_enabled,false);
  assert.equal(r.payment_execution_enabled,false);
  assert.equal(r.release_decision,'deny_automatic_deployment');
  assert.equal(r.physical_field_nodes_verified,0);
  assert.ok(r.blockers.some(x=>x.code==='PHYSICAL_DEVICE_TRUST_NOT_VERIFIED'));
  assert.ok(r.blockers.some(x=>x.code==='PRODUCTION_RELEASE_NOT_AUTHORIZED'));
});

test('security audit finding is held explicitly and never whitelisted by source green',()=>{
  const audit=passedAudit();audit.ok=false;
  audit.findings=[{code:'NEW_UNAPPROVED_WORKFLOW_WRITER',file:'.github/workflows/window-heartbeat.yml'}];
  const r=assessOsRelease({sourceReceipt:source(),writerAudit:audit});
  assert.equal(r.workflow_writer_audit_passed,false);
  assert.equal(r.source_readiness_proven,true);
  assert.equal(r.workflow_security_findings.length,1);
  assert.ok(r.blockers.some(x=>x.code==='WORKFLOW_WRITER_SECURITY_HOLD'));
});

test('missing receipt, duplicate lane, forged hash and claimed runtime each deny source-ready state',()=>{
  assert.equal(assessOsRelease({writerAudit:passedAudit()}).source_readiness_proven,false);
  const duplicate=source(); duplicate.lanes[0].lane_id=duplicate.lanes[1].lane_id;
  assert.equal(assessOsRelease({sourceReceipt:duplicate,writerAudit:passedAudit()}).source_readiness_proven,false);
  const tampered=source();tampered.systemia_policy.program_sha256='sha256:'+'b'.repeat(64);
  assert.equal(assessOsRelease({sourceReceipt:tampered,writerAudit:passedAudit()}).source_readiness_proven,false);
  const falseRuntime=source();falseRuntime.lanes[0].runtime_observed=true;
  assert.equal(assessOsRelease({sourceReceipt:falseRuntime,writerAudit:passedAudit()}).source_readiness_proven,false);
});

test('self-reported field claims cannot grant deployment regardless of arbitrary positive flags',()=>{
  const claimed={...source(),real_physical_nodes:true,field_verified:true,
    payments_received:true,production_deployed:true,owner_approved:true};
  const r=assessOsRelease({sourceReceipt:claimed,writerAudit:passedAudit(),
    field_receipts:[{verified:true}],deployment_approval:true});
  assert.equal(r.deploy_enabled,false);
  assert.equal(r.production_deployments_verified,0);
  assert.equal(r.live_workloads_on_owned_devices_verified,0);
  assert.equal(r.completed_customer_purchases_verified,0);
});
