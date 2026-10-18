#!/usr/bin/env node
// Founder-review-only external QA candidate. No production/external service
// credentials, network endpoints or owner device trust imported. This executes
// actual local OS worker and loopback HTTP test fixtures, not real remote nodes.
import {createHash} from 'node:crypto';
import {runRogueAgentMission} from './rogue-field-drill.mjs';
import {runCrossRunnerSpiderMission} from './spider-cross-runner-mission.mjs';
import {runPinnedNodeSeedPairLab} from './node-pair-live-lab.mjs';

const sha=(s)=>createHash('sha256').update(String(s)).digest('hex');
function requireEvidence(ok,msg){if(!ok)throw Error('EXTERNAL_QA_CHALLENGE_HELD: '+msg)}
export async function runOutsideReviewerChallenge(){
 const rogue=await runRogueAgentMission();
 requireEvidence(rogue.result==='PASSED_CONTAINED_LOCAL_ROGUE_DRILL_NOT_PRODUCTION'&&
  rogue.observed_rogue_process_terminated===true&&rogue.saban.completed_jobs===1&&
  rogue.blackbox.events===8&&rogue.authority==='NONE_READ_ONLY',
  'rogue source receipt failed');
 const spider=await runCrossRunnerSpiderMission(rogue);
 requireEvidence(spider.status==='PASSED_TWO_RUNNER_PROVIDER_HANDOFF_AND_RESTARTED_HTTP_SANDBOX_ONLY'&&
  spider.receiver_service_os_restart_completed===true&&
  spider.unauthorized_request_rejected===true&&
  spider.tampered_import_rejected===true&&spider.duplicate_transfer_rejected===true&&
  spider.second_wave_after_restart.length===4&&
  spider.final_readback.pending===0&&spider.global_no_regeneration_proven===false,
  'Spider frozen-state receiver acceptance failed');
 const nodes=await runPinnedNodeSeedPairLab();
 requireEvidence(nodes.result==='PASS_TWO_REAL_NODESEED_PROCESSES_CI_SINGLE_HOST_ONLY'&&
  nodes.actual_http_attestation_round_trips===2&&
  nodes.distinct_signing_keys_verified===true&&
  nodes.production_enrollment_verified===false,'NodeSeed lab attestation failed');
 requireEvidence(spider.source_event_manifest_sha256===rogue.transfer_packet.source_blackbox_manifest_sha256&&
  spider.source_snapshot_sha256===rogue.transfer_packet.spider_snapshot_sha256,
  'independent source and consumer snapshots disagree');
 // Include only public-class results, never local paths, keys, tokens or PIDs.
 return {
  schema:'evercraft.blackbox.founder-review-outside-challenge.v1',
  status:'PASS_REVIEWER_LOCAL_SAFETY_DRILL_ONLY',
  observer:'THIRD_PARTY_CAN_REPRODUCE_IN_OWN_LOCAL_SANDBOX',
  operator_scope:'REPO_BRANCH_LOCAL_ONLY_NO_PRODUCTION_AUTHORITY',
  host_network:'LOOPBACK_ONLY_ON_REVIEWER_COMPUTER',
  real_os_rogue_process_started_and_terminated:true,
  rogue_attempts:rogue.attack_attempts.map(a=>({kind:a.kind,decision:a.decision,executed:a.effect_executed})),
  blackbox_signed_local_event_count:rogue.blackbox.events,
  blackbox_event_manifest_sha256:rogue.transfer_packet.source_blackbox_manifest_sha256,
  local_spider_http_receiver_os_restart:true,
  local_spider_replay_denied_before_restart:spider.first_wave.length,
  local_spider_replay_denied_after_restart:spider.second_wave_after_restart.length,
  local_spider_no_pending_work_on_restart:spider.restart_readback.pending===0,
  pinned_lab_nodeseed_processes:nodes.local_node_seed_processes,
  fresh_ed25519_challenges:nodes.actual_http_attestation_round_trips,
  source_snapshot_sha256:spider.source_snapshot_sha256,
  verified_production_effects:0,
  externally_trusted_identity:false,
  canonical_systemia_admitted:false,
  live_entire_integration_verified:false,
  live_spider_service_verified:false,
  two_physical_node_independence_verified:false,
  permission_to_run_remote_actions:false,
  ready_for_founder_release_review:true,
  reviewer_receipt_sha256:sha(JSON.stringify([
   rogue.transfer_packet.source_blackbox_manifest_sha256,
   spider.source_snapshot_sha256,
   nodes.node_ids.map(()=> 'CI_ONLY_NODE_KEY')
  ]))
 };
}

const runDirect=process.argv[1]&&
 new URL('file://'+process.argv[1]).pathname===new URL(import.meta.url).pathname;
if(runDirect){
 if(process.argv.length!==2)throw Error('EXTERNAL_QA_CHALLENGE_HELD: no arguments; local safety drill only');
 const result=await runOutsideReviewerChallenge();
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
