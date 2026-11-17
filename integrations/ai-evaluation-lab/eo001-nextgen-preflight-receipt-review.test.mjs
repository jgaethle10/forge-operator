import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reviewNextGenReadOnlyPreflightReceipt as review}
  from './eo001-nextgen-preflight-receipt-review.mjs';

const flags=[
  'synthetic_scope_examined',
  'existing_synthetic_scope_present_verified',
  'user_systemd_manager_verified',
  'user_cgroup_delegation_verified',
  'effective_write_permission_verified',
  'cgroup_kill_control_examined',
  'control_file_opened_for_write',
  'process_signaled',
  'actual_scope_cleanup_proven',
  'independent_lab_attestation',
  'owner_and_lab_approval_present',
  'gate1_protocol_frozen',
  'model_execution_authorized',
  'physical_experiment_authorized'
];
function specimen(){
  return {
    schema:'evercraft.eo001.gate1.host-cgroup2-readonly-preflight.v1',
    state:'ROOT_CGROUP2_READONLY_METADATA_REVIEW_REQUIRED',
    evidence_class:'INJECTED_TEST_UNATTESTED_READONLY',
    boot_uuid_sha256:'a'.repeat(64),
    observer_membership_sha256:'b'.repeat(64),
    root_directory_identity_sha256:'c'.repeat(64),
    cgroup2_root_fs_observed:true,
    root_cgroup_type:'domain',
    root_controllers_available:{cpu:true,memory:true,pids:true},
    root_subtree_controllers_enabled:{cpu:true,memory:true,pids:false},
    ...Object.fromEntries(flags.map(flag=>[flag,false]))
  };
}
const failOn=(mutate,code)=>{
  const x=specimen();mutate(x);
  assert.throws(()=>review(JSON.parse(JSON.stringify(x))),
    new RegExp(code));
};
test('full root controller receipt returns only review-only metadata',()=>{
  const x=specimen();
  const y=review(JSON.parse(JSON.stringify(x)));
  assert.equal(y.state,'SUPPLIED_ROOT_METADATA_CONSISTENT_REVIEW_ONLY');
  assert.equal(y.source_receipt_class,'UNAUTHENTICATED_SUPPLIED_JSON');
  assert.equal(y.claimed_local_native_source,false);
  assert.deepEqual(y.reported_root_controllers_available,
    {cpu:true,memory:true,pids:true});
  for(const key of [
    'host_provenance_verified','user_cgroup_delegation_verified',
    'effective_cgroup_kill_permission_verified','existing_scope_inspected',
    'physical_containment_proven','independent_lab_attestation',
    'model_execution_authorized','physical_experiment_authorized',
    'lab_protocol_frozen','host_boot_identity_revealed',
    'host_cgroup_identity_revealed'
  ])assert.equal(y[key],false,key);
  for(const token of [x.boot_uuid_sha256,
    x.observer_membership_sha256,x.root_directory_identity_sha256]){
    assert.equal(JSON.stringify(y).includes(token),false);
  }
  assert.equal(Object.isFrozen(y),true);
});
test('native-provenance label remains an unauthenticated claim',()=>{
  const x=specimen();x.evidence_class='LOCAL_NATIVE_UNATTESTED_READONLY';
  const y=review(x);
  assert.equal(y.claimed_local_native_source,true);
  assert.equal(y.host_provenance_verified,false);
  assert.equal(y.physical_containment_proven,false);
});
test('missing process controller holds instead of promoting root ready',()=>{
  const x=specimen();
  x.root_controllers_available.pids=false;
  x.state='ROOT_CGROUP2_CONTROLLERS_INCOMPLETE_HOLD';
  const y=review(x);
  assert.equal(y.state,'SUPPLIED_ROOT_METADATA_INCOMPLETE_HOLD');
  assert.equal(y.reported_root_controllers_available.pids,false);
});
test('non-domain root holds even if root controllers are reported',()=>{
  const x=specimen();x.root_cgroup_type='domain threaded';
  x.state='ROOT_CGROUP2_CONTROLLERS_INCOMPLETE_HOLD';
  assert.equal(review(x).state,'SUPPLIED_ROOT_METADATA_INCOMPLETE_HOLD');
});
test('blocked preflight returns a distinct bounded negative outcome',()=>{
  const input={
    schema:'evercraft.eo001.gate1.host-cgroup2-readonly-preflight.v1',
    state:'HOST_READONLY_PREFLIGHT_BLOCKED',
    reason:'EO001_PREFLIGHT_NOT_CGROUP2',
    independent_lab_attestation:false,
    physical_experiment_authorized:false,
    model_execution_authorized:false
  };
  const y=review(input);
  assert.equal(y.state,'SUPPLIED_READONLY_PREFLIGHT_BLOCKED_HOLD');
  assert.equal(y.reported_reason,'EO001_PREFLIGHT_NOT_CGROUP2');
  assert.equal(y.physical_containment_proven,false);
  assert.equal(y.model_execution_authorized,false);
});
test('forged scope examination or physical authority is always refused',()=>{
  for(const flag of flags){
    failOn(x=>{x[flag]=true;},
      'EO001_PREFLIGHT_REVIEW_METADATA_OR_AUTHORITY_INVALID');
  }
});
test('unsafe additional raw host identifiers and proof fields are refused',()=>{
  for(const key of ['hostname','boot_id','raw_cgroup_path',
    'source_code','execution_authorized','host_attested']){
    failOn(x=>{x[key]='forged';},
      'EO001_PREFLIGHT_REVIEW_METADATA_OR_AUTHORITY_INVALID');
  }
});
test('tampered, wrong-sized or missing identity hashes are refused',()=>{
  for(const key of [
    'boot_uuid_sha256','observer_membership_sha256',
    'root_directory_identity_sha256'
  ]){
    failOn(x=>{x[key]='not-sha';},
      'EO001_PREFLIGHT_REVIEW_METADATA_OR_AUTHORITY_INVALID');
    failOn(x=>{delete x[key];},
      'EO001_PREFLIGHT_REVIEW_METADATA_OR_AUTHORITY_INVALID');
  }
});
test('contradictory or over-claimed root capability states are refused',()=>{
  failOn(x=>{x.root_controllers_available.pids=false;},
    'EO001_PREFLIGHT_REVIEW_STATE_OVERCLAIM');
  failOn(x=>{x.state='ROOT_CGROUP2_CONTROLLERS_INCOMPLETE_HOLD';},
    'EO001_PREFLIGHT_REVIEW_STATE_OVERCLAIM');
  failOn(x=>{x.root_subtree_controllers_enabled.pids=true;
    x.root_controllers_available.pids=false;},
    'EO001_PREFLIGHT_REVIEW_CONTROLLER_INCONSISTENT');
});
test('malformed or invented kernel controller names are refused',()=>{
  failOn(x=>{x.root_controllers_available.cpu='true';},
    'EO001_PREFLIGHT_REVIEW_METADATA_OR_AUTHORITY_INVALID');
  failOn(x=>{x.root_subtree_controllers_enabled.io=true;},
    'EO001_PREFLIGHT_REVIEW_METADATA_OR_AUTHORITY_INVALID');
  failOn(x=>{x.root_cgroup_type='production';},
    'EO001_PREFLIGHT_REVIEW_METADATA_OR_AUTHORITY_INVALID');
  failOn(x=>{x.evidence_class='VERIFIED_HOST';},
    'EO001_PREFLIGHT_REVIEW_METADATA_OR_AUTHORITY_INVALID');
});
test('blocked receipt rejects extra host fields, forged approval and raw reason',()=>{
  const blocked={
    schema:'evercraft.eo001.gate1.host-cgroup2-readonly-preflight.v1',
    state:'HOST_READONLY_PREFLIGHT_BLOCKED',
    reason:'EO001_PREFLIGHT_NOT_CGROUP2',
    independent_lab_attestation:false,
    physical_experiment_authorized:false,
    model_execution_authorized:false
  };
  for(const mutation of [
    x=>{x.physical_experiment_authorized=true;},
    x=>{x.reason='/proc/private/host';},
    x=>{x.hostname='host';},
    x=>{x.reason='EO001_FAKE';},
    x=>{x.model_execution_authorized='false';}
  ]){
    const x={...blocked};mutation(x);
    assert.throws(()=>review(x),
      /EO001_PREFLIGHT_REVIEW_BLOCKED_RECEIPT_INVALID/);
  }
});
test('source is PURE and imports no host control or filesystem facilities',()=>{
  const s=fs.readFileSync(
    new URL('./eo001-nextgen-preflight-receipt-review.mjs',import.meta.url),
    'utf8');
  for(const disallowed of [
    "from 'node:fs'","from 'node:child_process'","from 'node:net'",
    'process.kill(','execFileSync(','spawnSync(','writeFileSync(',
    'fetch(', 'O_WRONLY','O_RDWR'
  ]) assert.equal(s.includes(disallowed),false,disallowed);
});
