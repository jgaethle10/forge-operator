// Actual Saban scheduler executes a bounded READ-ONLY Black Box review formation.
// No mock provider may be confused with a live provider, no CI-ephemeral key
// with Passport enrollment and no test "pass" with Systemia admission.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {createWorkState} from '../saban/work-state.mjs';
import {runScheduler} from '../saban/scheduler.mjs';
import {LAB_STAGES,assembleLabChain,verifyLabChain} from './detached-receipt-chain.mjs';
import {consumeDetachedLabArtifact} from './detached-artifact-consumer.mjs';
import {assessOwnerTrustAnchor,fingerprintOwnerPublicTrust} from './owner-trust-preflight.mjs';
import {planAuthorizedContainment} from './response-policy.mjs';
import {COHORT,observeScheduledCohort} from './github-schedule-cohort.mjs';

const TENANT='evercraft',MISSION='evercraft-agent-continuity-fabric-20261016';
const NOW=Date.parse('2026-10-17T17:00:00Z');
const SCENARIOS=Object.freeze([
 'owner_trust_missing','owner_trust_pinned_lab_only','cross_job_manifest_tamper',
 'tenant_swap_hold','shutdown_requires_external_grant','out_of_scope_response',
 'five_lane_cohort_stale_and_failure','canonical_mission_bridge_ineligible'
]);
function sha(value){return createHash('sha256').update(value).digest('hex');}
function fixture(){
 const hashes=[{event_id:'saban-synthetic',event_sha256:'a'.repeat(64)}];
 const artifact_sha256=sha(JSON.stringify(hashes));
 const scope={tenant_id:TENANT,mission_id:MISSION,incident_id:'saban-blackbox-synthetic-drill',artifact_sha256};
 const roles=[],trust={};
 for(const stage of LAB_STAGES){
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const key_id='saban-ci-'+stage;
  roles.push({stage,key_id,private_key_pem:privateKey.export({format:'pem',type:'pkcs8'})});
  trust[key_id]={stage,tenant_id:TENANT,mission_id:MISSION,public_key_pem:publicKey.export({type:'spki',format:'pem'})};
 }
 const receipt_chain=assembleLabChain({...scope,chain_id:'saban-blackbox-drill',recorded_at:new Date(NOW).toISOString(),roles});
 const verification=verifyLabChain(receipt_chain,trust,scope);
 const artifact={
  schema:'evercraft.blackbox.ci-detached-roles-lab-evidence.v1',
  source_incident_id:scope.incident_id,source_event_count:1,source_event_hashes:hashes,
  source_artifact_sha256:artifact_sha256,
  signer_provisioning:'SAME_CI_JOB_EPHEMERAL_KEY_PAIRS_FOUR_DISTINCT_ROLES',
  producer_delivery_consumer_independence:'NOT_PROVEN',
  verifier_process:'SEPARATE_PROCESS_WITH_PUBLIC_KEY_TRUST',
  original_source_claim:'GITHUB_SCHEDULED_WORKFLOW_RUN_STATE_ONLY',
  systemia_admission:'NOT_ADMITTED',production_authorized:false,
  real_agent_telemetry_verified:false,service_delivery_verified:false,
  external_effect_verified:false,execution_authority:'NONE_READ_ONLY',
  receipt_chain,detached_public_trust:trust,verification
 };
 return {artifact,trust};
}
function defense(owner='Evercraft',approved=false){
 return {schema:'evercraft.defense.synthetic-drill.v1',synthetic:true,
  incident_id:'saban-blackbox-synthetic-drill',mission_id:MISSION,agent_id:'synthetic-worker',
  scope:{owner,operator_authorized:true,resource_id:'synthetic-worker'},
  signals:[{kind:'invalid_spawn_lease',truth_state:'OBSERVED',source_family:'lease-audit',source_ref:'synthetic:lease-1'},
   {kind:'unexpected_retry_growth',truth_state:'CORROBORATED',source_family:'queue-audit',source_ref:'synthetic:queue-2'}],
  network:{partitioned:true},break_glass:{approval_declared:approved,issuer:'independent-human-control-plane'}};
}
function providerStub(){
 const byRun=new Map(),calls=[];
 const fetcher=async(url,opts)=>{
  calls.push({url,method:opts.method});
  const cohortIndex=COHORT.findIndex(l=>url.includes('workflows/'+l.workflow+'/runs?'));
  if(cohortIndex>=0){
   const workflow=COHORT[cohortIndex];
   const age=[2*3600000,5*60000,2*3600000,20*60000,55*60000][cohortIndex];
   const created_at=new Date(NOW-age).toISOString();
   const id=75000+cohortIndex;
   const row={id,path:'.github/workflows/'+workflow.workflow,repository:{full_name:'jgaethle10/forge-operator'},
    event:'schedule',head_branch:'main',head_sha:'a'.repeat(40),created_at,
    status:'completed',conclusion:[ 'success','failure','success','success','failure'][cohortIndex],
    run_attempt:1,html_url:'https://github.com/jgaethle10/forge-operator/actions/runs/'+id};
   byRun.set(id,row);
   return {ok:true,status:200,text:async()=>JSON.stringify({workflow_runs:[row]})};
  }
  const id=Number(url.split('/').pop()),row=byRun.get(id);
  if(!row)throw Error('SABAN_DRILL_UNEXPECTED_PROVIDER_REQUEST');
  return {ok:true,status:200,text:async()=>JSON.stringify(row)};
 };
 return {fetcher,calls};
}
const expectedGate=Object.freeze({
 source:'INSPECTED_BASE44_MISSIONGATE_CODE_SNAPSHOT_NOT_LIVE_GATE_EXECUTION',
 allowed_mission_keys:['evercraft-ecosystem-loop-closure-v1','systemia-one-organism-orchestration-v1'],
 allowed_source_states:['draft','held'],intent_max_characters:6500
});
export async function runSabanBlackBoxReview({injectTransientFailure=true}={}){
 const assignments=SCENARIOS.map((scenario,index)=>({
  agent_id:'saban-review-'+String(index+1).padStart(2,'0'),
  idempotency_key:'saban-readonly-blackbox-'+scenario,
  role:'adversarial_readonly_reviewer',
  work:{kind:'synthetic_blackbox_review',key:scenario},
  item:{kind:'synthetic',raw:{scenario,side_effects_allowed:false}}
 }));
 const state=createWorkState({softwareId:'saban-blackbox-readonly-review',assignments,leaseSeconds:30,maxAttempts:2});
 const seen=new Set();
 const adapter={
  async runAssignment({assignment}){
   const scenario=assignment.work?.key;
   if(!SCENARIOS.includes(scenario)||assignment.item?.raw?.side_effects_allowed!==false)
    throw Error('SABAN_REVIEW_SCOPE_HELD');
   if(injectTransientFailure&&scenario==='tenant_swap_hold'&&!seen.has(scenario)){
    seen.add(scenario);throw Error('SABAN_SYNTHETIC_TRANSIENT_WORKER_LOSS');
   }
   const {artifact,trust}=fixture();
   let claim;
   switch(scenario){
   case 'owner_trust_missing':{
    const result=assessOwnerTrustAnchor({artifact});
    assert.equal(result.state,'HELD_OWNER_TRUST_FINGERPRINT_NOT_CONFIGURED');
    assert.equal(result.release_authorized,false);
    claim=result.state;break;
   }
   case 'owner_trust_pinned_lab_only':{
    const fingerprint=fingerprintOwnerPublicTrust(trust);
    const result=assessOwnerTrustAnchor({artifact,configured_public_trust:trust,owner_pinned_sha256:fingerprint});
    assert.equal(result.state,'PINNED_SIGNATURE_SET_VERIFIED_LAB_ONLY');
    assert.equal(result.independent_passport_issuer_verified,false);
    assert.equal(result.release_authorized,false);
    claim=result.state;break;
   }
   case 'cross_job_manifest_tamper':{
    const evil=structuredClone(artifact);
    evil.source_event_hashes[0].event_sha256='f'.repeat(64);
    assert.throws(()=>consumeDetachedLabArtifact(evil),/BLACKBOX_CROSS_JOB_CONSUMER_HELD/);
    claim='TAMPER_HELD';break;
   }
   case 'tenant_swap_hold':{
    const evil=structuredClone(artifact);
    evil.receipt_chain.receipts[0].payload.tenant_id='attacker';
    assert.throws(()=>consumeDetachedLabArtifact(evil),/BLACKBOX_DETACHED_CHAIN_HELD/);
    claim='TENANT_SWAP_HELD';break;
   }
   case 'shutdown_requires_external_grant':{
    const result=planAuthorizedContainment(defense('Evercraft',true));
    assert.equal(result.destructive_eradication_authorized,false);
    assert.equal(result.live_response_executed,false);
    assert.equal(result.independent_shutdown_gate,'DECLARED_APPROVAL_REQUIRES_EXTERNAL_SIGNATURE_VALIDATION');
    claim='CONTAINMENT_NOT_AUTHORIZED';break;
   }
   case 'out_of_scope_response':{
    const result=planAuthorizedContainment(defense('another-organization'));
    assert.equal(result.threat_state,'OUT_OF_SCOPE');
    assert.equal(result.external_network_pursuit_authorized,false);
    claim='OTHER_TENANT_RESPONSE_DENIED';break;
   }
   case 'five_lane_cohort_stale_and_failure':{
    const mock=providerStub();
    const result=await observeScheduledCohort({repo:'jgaethle10/forge-operator',token:'saban-synthetic-token',now:NOW,fetcher:mock.fetcher});
    assert.equal(result.lanes.length,5);
    assert.equal(result.summary.stale_or_missing,2);
    assert.equal(result.summary.non_successful_recent_runs,2);
    assert.equal(result.service_recovery_verified,false);
    assert.equal(result.common_cause_verified,false);
    assert.equal(mock.calls.length,10);
    assert.ok(mock.calls.every(x=>x.method==='GET'));
    claim='SYNTHETIC_PROVIDER_COHORT_SEPARATED';break;
   }
   case 'canonical_mission_bridge_ineligible':{
    const directive={mission:'evercraft-agent-continuity-fabric-20261016',
     state:'awaiting_canonical_admission',intent_characters:19037};
    const blockedReasons=[
     !expectedGate.allowed_mission_keys.includes(directive.mission)?'MISSION_NOT_IN_CORE_ISSUER_ALLOWLIST':null,
     !expectedGate.allowed_source_states.includes(directive.state)?'DRAFT_STATE_NOT_ACCEPTED':null,
     directive.intent_characters>expectedGate.intent_max_characters?'DIRECTIVE_EXCEEDS_BOUNDED_REQUEST_LENGTH':null
    ].filter(Boolean);
    assert.equal(blockedReasons.length,3);
    claim='OFFLINE_GATE_POLICY_REJECTS_DIRECT_ADMISSION';break;
   }
   default:throw Error('SABAN_UNKNOWN_DRILL');
   }
   return {status:'pass',scenario,claim,evidence_kind:'SYNTHETIC_LOCAL_REVIEW',
    source:'SABAN_SCHEDULER_LEASED_WORKER',execution_authority:'NONE_READ_ONLY'};
  }
 };
 const receipt=await runScheduler({state,adapter,physicalWorkers:3,
  plan:{software_id:'saban-blackbox-readonly-review',logical_agents:SCENARIOS.length,physical_workers:3},
  contract:{software_id:'saban-blackbox-readonly-review',side_effects:{default:'deny'}}});
 const jobs=Object.values(receipt.state.jobs);
 assert.equal(receipt.summary.total,SCENARIOS.length);
 assert.equal(receipt.summary.counts.completed,SCENARIOS.length);
 assert.equal(receipt.summary.counts.dead_letter??0,0);
 assert.equal(receipt.summary.retried,injectTransientFailure?1:0);
 assert.ok(jobs.every(j=>j.result?.status==='pass'&&j.result?.execution_authority==='NONE_READ_ONLY'));
 return {
  schema:'evercraft.saban.blackbox-governed-review.v1',
  runner:'REAL_SABAN_WORK_STATE_AND_SCHEDULER',
  run_provenance:'GITHUB_CI_RUNS_NODE_LOCAL_SYNTHETIC_FIXTURES',
  source_truth:'TEST_ONLY_NO_LIVE_SYSTEMIA_ADMISSION_OR_PROVIDER_EFFECT',
  scenarios:jobs.map(j=>({scenario:j.result.scenario,state:j.state,attempts:j.attempts,claim:j.result.claim})),
  scheduler:{workers:receipt.worker_count,jobs:receipt.summary.total,completed:receipt.summary.counts.completed,retried:receipt.summary.retried,dead_letter:receipt.summary.counts.dead_letter??0},
  admission_readback:'NOT_RUN_CANONICAL_GATE',
  blackbox_owner_trust:'HELD',
  genuine_passport_enrollment:false,actual_chum_spider_transport:false,
  independent_effect_verification:false,execution_authority:'NONE_READ_ONLY',
  status:'PASS_SYNTHETIC_REVIEW_ONLY'
 };
}
