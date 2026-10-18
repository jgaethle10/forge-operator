#!/usr/bin/env node
// Full lab integration: actual provider-transferred rogue artifact -> two real
// NodeSeed HTTP challenges with transient CI-only pins -> actual restarted
// Spider sandbox HTTP process -> Saban/Black Box lineage preservation.
// This DOES NOT enroll or reach any owned physical Evercraft node.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {withLabNodePair} from './node-pair-live-lab.mjs';
import {probePinnedNodePair} from './pinned-nodeseed-pair.mjs';
import {runCrossRunnerSpiderMission} from './spider-cross-runner-mission.mjs';
import {validateTransferPacket} from './spider-cross-runner-contract.mjs';
if(!process.argv[2])throw Error('ROGUE_NODEPAIR_INTEGRATION_HELD: provider artifact path required');
const raw=readFileSync(resolve(process.argv[2]),'utf8');
if(Buffer.byteLength(raw)>131072)throw Error('ROGUE_NODEPAIR_INTEGRATION_HELD: input oversized');
const producer=JSON.parse(raw);
const source=validateTransferPacket(producer);
const result=await withLabNodePair(async({pins,tokenByNode})=>{
 const nodePair=await probePinnedNodePair({nodes:pins,tokenByNode});
 const spider=await runCrossRunnerSpiderMission(producer);
 if(nodePair.identities.length!==2||nodePair.two_distinct_pinned_keys_verified!==true||
  nodePair.containment_release_authorized!==false||
  spider.status!=='PASSED_TWO_RUNNER_PROVIDER_HANDOFF_AND_RESTARTED_HTTP_SANDBOX_ONLY'||
  spider.source_snapshot_sha256!==source.source_snapshot_sha256||
  spider.source_event_manifest_sha256!==source.source_blackbox_manifest_sha256||
  spider.final_readback.pending!==0||spider.global_no_regeneration_proven!==false)
  throw Error('ROGUE_NODEPAIR_INTEGRATION_HELD: invalid end-to-end proof');
 return {
  schema:'evercraft.blackbox.rogue-spider-nodeseed-integrated-lab.v1',
  actual_saban_rogue_producer_prior_runner:true,
  producer_blackbox_signed_source_event_count:source.source_blackbox_count,
  provider_transferred_artifact_consumed:true,
  receiver_real_nodeseed_http_servers:2,
  receiver_real_nodeseed_challenge_responses:2,
  receiver_distinct_ephemeral_ci_keys:nodePair.two_distinct_pinned_keys_verified,
  receiver_real_spider_http_service_process_restarted:spider.receiver_service_os_restart_completed,
  cross_runner_source_manifest_sha256:source.source_blackbox_manifest_sha256,
  remote_spider_received_source_manifest_sha256:spider.source_event_manifest_sha256,
  receiver_replay_denials_after_restart:spider.second_wave_after_restart.length,
  receiver_remaining_active_jobs:spider.final_readback.pending,
  execution_class:'ACTUAL_OS_PROCESSES_AND_HTTP_CI_ON_SINGLE_RECEIVER_HOST',
  actual_two_owner_devices_contacted:false,
  unique_hardware_failure_domains_verified:false,
  independent_owner_identity_registry_verified:false,
  production_spider_society_service_called:false,
  systemia_canonical_mission_admitted:false,
  global_no_regeneration_proven:false,
  execution_authority:'NONE_READ_ONLY',
  status:'PASS_REPO_HARDENED_CROSS_PRODUCT_CI_EXERCISE_NOT_PRODUCTION'
 };
});
process.stdout.write(JSON.stringify(result,null,2)+'\n');
