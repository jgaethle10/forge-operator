/**
 * EO-001 Gate 1: pure, offline, fail-closed review of a claimed
 * read-only host-root cgroup v2 capability preflight receipt.
 *
 * No host access, filesystem I/O, child processes, network, model execution
 * or authorization. This is structural consistency of UNTRUSTED supplied
 * metadata, not host provenance, a target-scope survey or containment proof.
 * Sensitive observed hashes are deliberately NOT copied into the output.
 */
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const need=(condition,code)=>{if(!condition)fail(code);};
const HEX64=/^[a-f0-9]{64}$/;
const SCHEMA='evercraft.eo001.gate1.host-cgroup2-readonly-preflight.v1';
const STATES=[
  'ROOT_CGROUP2_READONLY_METADATA_REVIEW_REQUIRED',
  'ROOT_CGROUP2_CONTROLLERS_INCOMPLETE_HOLD'
];
const ORIGINS=['LOCAL_NATIVE_UNATTESTED_READONLY',
  'INJECTED_TEST_UNATTESTED_READONLY'];
const VALID_TYPES=['domain','threaded','domain threaded','domain invalid'];
const FLAGS=[
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
const RECEIPT_KEYS=[
  'schema','state','evidence_class',
  'boot_uuid_sha256','observer_membership_sha256',
  'root_directory_identity_sha256',
  'cgroup2_root_fs_observed','root_cgroup_type',
  'root_controllers_available','root_subtree_controllers_enabled',
  ...FLAGS
];
const BLOCK_KEYS=[
  'schema','state','reason','independent_lab_attestation',
  'physical_experiment_authorized','model_execution_authorized'
];
const exact=(record,keys)=>record!==null&&
  typeof record==='object'&&!Array.isArray(record)&&
  Object.keys(record).sort().join('|')===keys.slice().sort().join('|');
const vector=x=>exact(x,['cpu','memory','pids'])&&
  ['cpu','memory','pids'].every(key=>typeof x[key]==='boolean');
const triple=x=>Object.freeze({
  cpu:x.cpu,memory:x.memory,pids:x.pids
});
const boundedReason=/^EO001_PREFLIGHT_[A-Z_]{3,80}$/;

/**
 * No reported state admits physical access or approvals. The "native"
 * origin string is a claimed label in a mutable JSON object, not an
 * authenticated host statement. Reject unknown output fields outright.
 */
export function reviewNextGenReadOnlyPreflightReceipt(receipt){
  need(receipt&&typeof receipt==='object'&&!Array.isArray(receipt)&&
    receipt.schema===SCHEMA,
    'EO001_PREFLIGHT_REVIEW_SCHEMA_INVALID');
  if(receipt.state==='HOST_READONLY_PREFLIGHT_BLOCKED'){
    need(exact(receipt,BLOCK_KEYS)&&
      typeof receipt.reason==='string'&&
      boundedReason.test(receipt.reason)&&
      receipt.independent_lab_attestation===false&&
      receipt.model_execution_authorized===false&&
      receipt.physical_experiment_authorized===false,
      'EO001_PREFLIGHT_REVIEW_BLOCKED_RECEIPT_INVALID');
    return Object.freeze({
      schema:'evercraft.eo001.gate1.preflight-receipt-review.v1',
      state:'SUPPLIED_READONLY_PREFLIGHT_BLOCKED_HOLD',
      source_receipt_class:'UNAUTHENTICATED_SUPPLIED_JSON',
      reported_reason:receipt.reason,
      host_provenance_verified:false,
      existing_scope_inspected:false,
      physical_containment_proven:false,
      lab_protocol_frozen:false,
      model_execution_authorized:false,
      physical_experiment_authorized:false
    });
  }
  need(STATES.includes(receipt.state)&&exact(receipt,RECEIPT_KEYS)&&
    ORIGINS.includes(receipt.evidence_class)&&
    HEX64.test(receipt.boot_uuid_sha256||'')&&
    HEX64.test(receipt.observer_membership_sha256||'')&&
    HEX64.test(receipt.root_directory_identity_sha256||'')&&
    receipt.cgroup2_root_fs_observed===true&&
    VALID_TYPES.includes(receipt.root_cgroup_type)&&
    vector(receipt.root_controllers_available)&&
    vector(receipt.root_subtree_controllers_enabled)&&
    FLAGS.every(flag=>receipt[flag]===false),
    'EO001_PREFLIGHT_REVIEW_METADATA_OR_AUTHORITY_INVALID');
  const available=receipt.root_controllers_available;
  const enabled=receipt.root_subtree_controllers_enabled;
  need(['cpu','memory','pids'].every(name=>
    !enabled[name]||available[name]),
    'EO001_PREFLIGHT_REVIEW_CONTROLLER_INCONSISTENT');
  const expected=receipt.root_cgroup_type==='domain'&&
    available.cpu&&available.memory&&available.pids?
    STATES[0]:STATES[1];
  need(receipt.state===expected,
    'EO001_PREFLIGHT_REVIEW_STATE_OVERCLAIM');
  return Object.freeze({
    schema:'evercraft.eo001.gate1.preflight-receipt-review.v1',
    state:expected===STATES[0]?
      'SUPPLIED_ROOT_METADATA_CONSISTENT_REVIEW_ONLY':
      'SUPPLIED_ROOT_METADATA_INCOMPLETE_HOLD',
    source_receipt_class:'UNAUTHENTICATED_SUPPLIED_JSON',
    claimed_local_native_source:receipt.evidence_class===ORIGINS[0],
    root_cgroup2_report_consistent:true,
    reported_domain_root:receipt.root_cgroup_type==='domain',
    reported_root_controllers_available:triple(available),
    reported_root_subtree_controllers_enabled:triple(enabled),
    host_boot_identity_revealed:false,
    host_cgroup_identity_revealed:false,
    host_provenance_verified:false,
    user_cgroup_delegation_verified:false,
    effective_cgroup_kill_permission_verified:false,
    existing_scope_inspected:false,
    physical_containment_proven:false,
    independent_lab_attestation:false,
    lab_protocol_frozen:false,
    model_execution_authorized:false,
    physical_experiment_authorized:false
  });
}
