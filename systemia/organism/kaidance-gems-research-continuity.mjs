// DOE GEMS source-only R&D continuity inside the EXISTING Kaidance company tick.
// Not a scheduler, work dispatcher, scientific validator or remote HTTP runner.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const SHA=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const ACTION='inspect_authorized_private_penguin_capture_stderr_before_any_retry';
const VALID_WORK=new Map([
 ['gems:008e:owner-private-capture',['blocked_private_capture_error_review',ACTION]],
 ['gems:007:frozen-quota',['blocked_frozen_negative_bin_quota',
  'preserve_original_quota_and_gems007_blocker_no_model_fit']],
 ['gems:independent-fault-truth',['hold_unqualified_source_lineage',
  'review_original_fault_provenance_and_source_rights_before_validation']]
]);
const held=(reason)=>({
 schema:'evercraft.kaidance.gems-research-source-review.v1',
 status:'held_source',reason,source_registry_verified:false,
 source_only:true,mission_key:'doe-gems-geodawn-research',
 lane_key:'science-research',evidence_ref:null,workstreams_reviewed:0,
 remote_execution_performed:false,actual_nbmg_features_verified:false,
 private_log_read:false,independent_fault_truth_verified:false,
 scientific_artifacts_created:0,model_training_executed:false,
 submission_made:false,payment_authorized:false,
 review_candidates:[]
});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const allFalse=(obj,keys)=>object(obj)&&keys.every(key=>obj[key]===false);
const exact=arr=>Array.isArray(arr)&&arr.length===VALID_WORK.size&&
 arr.every(w=>object(w)&&VALID_WORK.has(w.work_key)&&
   w.state===VALID_WORK.get(w.work_key)[0]&&
   w.next_action===VALID_WORK.get(w.work_key)[1]&&
   w.automatic_retry===false&&w.source_independence_verified===false)&&
 new Set(arr.map(w=>w.work_key)).size===arr.length;

export function inspectGemsResearchRegistry(value,now=new Date(),fingerprint='') {
 const t=new Date(now);
 if(!Number.isFinite(t.getTime()))return held('invalid_clock');
 const v=value,c=v?.canonical,claims=v?.claims,authority=v?.authority;
 if(v?.schema!=='evercraft.kaidance.gems-research-continuity.v1'||
  v?.mission_key!=='doe-gems-geodawn-research'||
  v?.lane_key!=='science-research'||v?.heartbeat_seconds!==300||
  v?.source_authority!=='founder_reported_git_issue_source_only'||
  c?.repository!=='jgaethle10/forge-operator'||
  c?.research_branch!=='research/gems-systemia-bridge-20261118'||
  c?.research_source_commit!=='fae48adc188d2a2d28e12a5b540453dfe64aceb4'||
  c?.research_pr!==2259||c?.continuity_issue!==2260||
  v?.selected_entry?.driven_data_submission_id!==330339||
  v?.selected_entry?.official_public_dti_reported!==0.0552||
  v?.selected_entry?.reported_not_freshly_verified!==true||
  v?.selected_entry?.selection_change_authorized!==false||
  !exact(v?.workstreams)||
  !object(claims)||claims.actual_nbmg_features_obtained!==false||
  claims.penguin_5_synthetic_tests_reported_pass!==true||
  claims.penguin_https_capture_reported_failed!==true||
  claims.private_capture_error_contents_observed!==false||
  claims.independent_fault_validation_qualified!==false||
  claims.new_scored_submission_made!==false||
  claims.new_training_executed!==false||
  claims.paid_compute_authorized!==false||
  !allFalse(authority,['owner_private_evidence_mount','network_probe',
   'remote_shell','automatic_work_dispatch','license_or_competition_submission',
   'code_write','deployment','external_outreach'])||
  !/^sha256:[0-9a-f]{64}$/.test(fingerprint))
  return held('registry_contract_invalid');

 return {
  schema:'evercraft.kaidance.gems-research-source-review.v1',
  status:'source_registered_review_required',
  observed_at:t.toISOString(),
  heartbeat_seconds:300,
  source_registry_verified:true,source_only:true,
  source_authority:v.source_authority,source_registry_fingerprint:fingerprint,
  mission_key:v.mission_key,lane_key:v.lane_key,
  evidence_ref:'source:github:jgaethle10/forge-operator:issue:2260',
  research_pr:2259,selected_submission_id:330339,
  selected_dti_reported_not_reverified:0.0552,
  workstreams_reviewed:v.workstreams.length,held_workstreams:3,
  owner_private_rd_export_independently_verified:false,
  remote_execution_performed:false,
  actual_nbmg_features_verified:false,
  private_log_read:false,
  independent_fault_truth_verified:false,
  scientific_artifacts_created:0,model_training_executed:false,
  submission_made:false,payment_authorized:false,
  // One actionable review, no automatic retry of uncertain owner HTTP effects.
  review_candidates:[{
   work_key:'gems:008e:review-capture-error',
   lane_key:'science-research',priority:3,action:ACTION,
   source_evidence_ref:'github:issue:2260',
   authority:'existing_systemia_owner_review_required',
   execution_authorized:false,remote_shell_authorized:false,
   network_authorized:false,retry_authorized:false,
   submission_authorized:false,scientific_result_verified:false
  }]
 };
}
export function reviewGemsResearchSource({root,now=new Date()}={}){
 try{
  const repo=path.resolve(root||'');
  if(!root||!path.isAbsolute(repo))return held('repo_root_unavailable');
  const folder=path.join(repo,'registry');
  const p=path.join(folder,'kaidance-gems-research-continuity.v1.json');
  const dir=fs.lstatSync(folder),st=fs.lstatSync(p);
  if(!dir.isDirectory()||dir.isSymbolicLink()||!st.isFile()||
     st.isSymbolicLink()||st.size<2||st.size>16384)
    return held('unsafe_or_missing_registry');
  const raw=fs.readFileSync(p);
  if(raw.length!==st.size)return held('registry_changed_during_read');
  return inspectGemsResearchRegistry(JSON.parse(raw),now,SHA(raw));
 }catch{return held('registry_unavailable_or_invalid')}
}
