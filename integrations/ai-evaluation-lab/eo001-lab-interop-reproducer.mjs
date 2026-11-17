#!/usr/bin/env node
/**
 * EO-001 Forge-side, source-pinned LAB INTEROPERABILITY REPRODUCER.
 *
 * This is a review of PURE source on synthetic JSON fixtures, NOT a host,
 * kernel, systemd, model, payment, or physical containment test. Ported
 * vectors are independently defined in Lab PR #51 at commit 317af00 and
 * remain visibly attributed to that peer review.
 *
 * No CLI arguments, no network, no host inspection, no source mutation,
 * no child process, no secret or private receipt access. Git blob and
 * sha256 identify the EXACT bytes executed via data-URL import.
 *
 * An output JSON artifact is a reproducible CI record, NOT a signed
 * independent attestation of the real host or of reviewer approval.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const LAB_REVIEW_COMMIT='317af00e51dc613342e9a4e13948441f36a7ead1';
const LAB_REVIEWED_FORGE='70510dbc18a326c8846e5a7005aa7198a9744987';
const SOURCE=new URL('./eo001-held-cgroup-kill-survey-join.mjs',import.meta.url);
const SHA40=/^[a-f0-9]{40}$/;
const HASH64=/^[a-f0-9]{64}$/;
const sha=value=>createHash('sha256').update(value).digest('hex');
const gitBlob=value=>createHash('sha1')
  .update(Buffer.from('blob '+value.length+'\0')).update(value).digest('hex');
const U='eo001-g1-synthetic-'+'a'.repeat(32)+'.scope';
const P='/user.slice/user-1000.slice/user@1000.service/app.slice/'+U;
const BOOT='12345678-1234-4123-8123-123456789abc';
const REV=LAB_REVIEWED_FORGE;
const TRUE_STATE='MATCHING_LOCAL_CGROUP_KILL_METADATA_REVIEW_ONLY';
const NON_AUTHORIZED=['kernel_write_permission_proven',
  'actual_original_cgroup_fd_attested','independently_authenticated_host',
  'independent_lab_observation','manager_unit_incarnation_verified',
  'live_detached_child_verified','exact_resource_limits_verified',
  'method_frozen_by_lab','owner_and_reviewer_approvals_valid',
  'old_stop_permit_reusable','actual_kernel_write_performed',
  'physical_scope_cleanup_proven','source_and_host_execution_admitted',
  'model_execution_authorized','production_execution_authorized'];

function fixture(){
  return {
    proposal:{
      schema:'evercraft.eo001.gate1.exact-scope-stop-review.v1',
      state:'FIXED_SYNTHETIC_STOP_CANDIDATE_REQUIRES_INDEPENDENT_REVIEW',
      requires_fresh_explicit_owner_approval:true,execution_authorized:false,
      actual_stop_performed:false,executable_implementation_reviewed:false,
      resource_policy:'SYNTHETIC_ONLY_ZERO_SWAP',reviewed_source_revision:REV,
      scope_unit:U,cgroup_path:P
    },
    candidate:{
      schema:'evercraft.eo001.gate1.held-cgroup-kill-review.v1',
      state:'HELD_SCOPE_CGROUP_KILL_CANDIDATE_SOURCE_REVIEW_ONLY',
      target_lookup_rule:'ONLY_RELATIVE_TO_HELD_ORIGINAL_SCOPE_FD',
      candidate_kernel_control_file:'cgroup.kill',candidate_single_write_value:'1',
      candidate_signal_semantics:'SIGKILL_WHOLE_CGROUP_SUBTREE',
      name_based_systemd_stop_used:false,control_file_opened:false,
      kernel_write_attempted:false,production_execution_authorized:false,
      model_execution_authorized:false,current_owner_and_reviewer_permit_usable:false,
      separate_protocol_review_required:true,
      separate_owner_and_lab_approval_required:true,
      kernel_write_permission_proven:false,
      original_scope_handle_proven_authentic:false,
      scope_replacement_race_eliminated_in_real_host:false,
      physical_descendant_death_proven:false,
      poststop_subtree_empty_independently_verified:false,
      cgroup_path_sha256:sha(P),scope_unit:U,source_revision:REV,
      expected_original_cgroup_device:'31',expected_original_cgroup_inode:'987654321',
      expected_boot_id:BOOT
    },
    survey:{
      schema:'evercraft.eo001.gate1.cgroup-kill-readonly-survey.v1',
      state:'LOCAL_CGROUP_KILL_METADATA_OBSERVED_REVIEW_REQUIRED',
      record_provenance:'INJECTED_TEST_READ_ONLY_UNATTESTED',
      cgroup2_filesystem_metadata_matched:true,cgroup_type:'domain',
      observed_populated_at_survey:true,cgroup_kill_entry_present:true,
      cgroup_kill_file_opened:false,cgroup_kill_write_attempted:false,
      scope_stop_requested:false,observer_outside_scope_at_survey:true,
      kernel_permission_to_write_verified:false,
      manager_unit_incarnation_verified:false,
      live_detached_child_verified:false,
      exact_resource_limits_verified:false,
      independently_authenticated_host:false,
      separately_reviewed_stop_method:false,
      owner_and_lab_approvals_present:false,
      model_execution_authorized:false,execution_authorized:false,
      scope_path_sha256:sha(P),scope_unit:U,source_revision:REV,
      original_scope_device:'31',original_scope_inode:'987654321',
      boot_id:BOOT,cgroup_kill_mode_has_owner_write_bit:true
    }
  };
}
function updatePath(f,value){
  f.proposal.cgroup_path=value;
  f.candidate.cgroup_path_sha256=sha(value);
  f.survey.scope_path_sha256=sha(value);
}
// Same named cases and expected classifications as the independent Lab
// probe. This is Forge's independently executable in-repo conformance copy.
const VECTORS=[
  ['matching_metadata','existing_boundary','ACCEPT_REVIEW_ONLY',()=>{}],
  ['boot_mismatch','existing_boundary','REJECT',f=>{f.survey.boot_id='ffffffff-ffff-4fff-8fff-ffffffffffff';}],
  ['source_mismatch','existing_boundary','REJECT',f=>{f.survey.source_revision='b'.repeat(40);}],
  ['inode_mismatch','existing_boundary','REJECT',f=>{f.survey.original_scope_inode='987654322';}],
  ['old_stop_permit','existing_boundary','REJECT',f=>{f.candidate.current_owner_and_reviewer_permit_usable=true;}],
  ['name_based_target','existing_boundary','REJECT',f=>{f.candidate.target_lookup_rule='RESOLVE_BY_NAME';}],
  ['kernel_write_claim','existing_boundary','REJECT',f=>{f.candidate.kernel_write_attempted=true;}],
  ['hardware_attestation_claim','existing_boundary','REJECT',f=>{f.survey.independently_authenticated_host=true;}],
  ['effective_permission_claim','existing_boundary','REJECT',f=>{f.survey.kernel_permission_to_write_verified=true;}],
  ['old_method_write_value','existing_boundary','REJECT',f=>{f.candidate.candidate_single_write_value='0';}],
  ['fabricated_lab_approval','existing_boundary','REJECT',f=>{f.survey.owner_and_lab_approvals_present=true;}],
  ['unbounded_resource_policy','existing_boundary','REJECT',f=>{f.proposal.resource_policy='UNBOUNDED';}],
  ['numeric_device_and_inode','lab_hardening','REJECT',f=>{
    f.candidate.expected_original_cgroup_device=31;
    f.survey.original_scope_device=31;
    f.candidate.expected_original_cgroup_inode=987654321;
    f.survey.original_scope_inode=987654321;
  }],
  ['relative_path_agreed_by_both_views','lab_hardening','REJECT',f=>{
    updatePath(f,'relative/'+U);
  }],
  ['dotdot_path_agreed_by_both_views','lab_hardening','REJECT',f=>{
    updatePath(f,'/user.slice/../'+U);
  }]
];
function verifiedBytes(){
  let fd;
  try{
    fd=fs.openSync(SOURCE,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    const st=fs.fstatSync(fd);
    if(!st.isFile()||st.size<100||st.size>65536)
      throw Error('SOURCE_SIZE_OR_TYPE_INVALID');
    const buf=fs.readFileSync(fd);
    if(buf.length!==st.size)throw Error('SOURCE_CHANGED_DURING_READ');
    // Avoid loading a second, possibly mutated path: import exactly these
    // hashed bytes via a data URL, never the mutable filesystem path.
    return buf;
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}
async function main(){
  if(process.argv.length!==2)throw Error('NO_ARGUMENTS_ALLOWED');
  const bytes=verifiedBytes();
  const sha256=sha(bytes),blob=gitBlob(bytes);
  if(!HASH64.test(sha256)||!SHA40.test(blob))
    throw Error('SOURCE_DIGEST_INVALID');
  const imported=await import('data:text/javascript;base64,'+
    bytes.toString('base64'));
  if(typeof imported.joinHeldScopeKillSurveyForReview!=='function')
    throw Error('SOURCE_EXPORT_MISSING');
  const join=imported.joinHeldScopeKillSurveyForReview;
  const results=VECTORS.map(([name,group,expected,mutate])=>{
    const f=fixture();mutate(f);
    const input=JSON.parse(JSON.stringify(f));
    let actual,reason=null,outputAuthorityFalse=null;
    try{
      const output=join(input);
      outputAuthorityFalse=NON_AUTHORIZED.every(k=>output?.[k]===false);
      actual=output?.state===TRUE_STATE&&
        output.metadata_agreement_only===true&&
        output.source_view_count===2&&
        outputAuthorityFalse&&
        !JSON.stringify(output).includes(input.proposal.cgroup_path)?
        'ACCEPT_REVIEW_ONLY':'UNEXPECTED_OUTPUT';
    }catch(error){
      const code=error?.code;
      if(typeof code==='string'&&/^CGKILL_JOIN_[A-Z_]+$/.test(code)){
        actual='REJECT';reason=code;
      }else actual='UNEXPECTED_EXCEPTION';
    }
    return {case:name,group,expected,actual,
      expectation_met:expected===actual,
      refusal_code:reason,returned_authority_flags_false:outputAuthorityFalse};
  });
  const failed=results.filter(r=>!r.expectation_met);
  const report={
    schema:'evercraft.eo001.lab-interop-review.v1',
    state:failed.length?'INTEROPERABILITY_REVIEW_FAILED':
      'SYNTHETIC_INTEROPERABILITY_EXPECTATIONS_MATCHED',
    lab_review_commit:LAB_REVIEW_COMMIT,
    originally_reviewed_forge_commit:LAB_REVIEWED_FORGE,
    current_tested_source_sha256:sha256,
    current_tested_git_blob:blob,
    runtime_major:Number(process.versions.node.split('.')[0]),
    case_count:results.length,
    passed_count:results.length-failed.length,
    failure_count:failed.length,
    original_boundary_count:results.filter(r=>r.group==='existing_boundary').length,
    independent_lab_hardening_count:results.filter(r=>r.group==='lab_hardening').length,
    matching_records_independently_attested:false,
    independently_authenticated_host:false,
    kernel_stop_attempted:false,
    qwen_executed:false,
    actual_scope_cleanup_proven:false,
    physical_experiment_authorized:false,
    lab_v02_contract_frozen:false,
    cases:results
  };
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  return failed.length?2:0;
}
try{process.exitCode=await main();}
catch{
  process.stderr.write('EO001_LAB_INTEROP_SETUP_BLOCKED\n');
  process.exitCode=3;
}
