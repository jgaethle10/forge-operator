#!/usr/bin/env node
// SECOND-GITHUB-JOB readonly consumer of the producer job's uploaded JSON.
// A successful cross-job transfer is real GitHub artifact delivery, not proof
// of independent key governance, Passport enrollment or CHUM/Spider runtime.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {verifyLabChain} from './detached-receipt-chain.mjs';
function hold(x){throw Error('BLACKBOX_CROSS_JOB_CONSUMER_HELD: '+x);}
const hex=/^[a-f0-9]{64}$/;
function digest(x){return createHash('sha256').update(x).digest('hex');}
export function consumeDetachedLabArtifact(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.schema!=='evercraft.blackbox.ci-detached-roles-lab-evidence.v1')
  hold('unexpected lab artifact schema');
 if(input.signer_provisioning!=='SAME_CI_JOB_EPHEMERAL_KEY_PAIRS_FOUR_DISTINCT_ROLES'||
    input.producer_delivery_consumer_independence!=='NOT_PROVEN'||
    input.verifier_process!=='SEPARATE_PROCESS_WITH_PUBLIC_KEY_TRUST'||
    input.original_source_claim!=='GITHUB_SCHEDULED_WORKFLOW_RUN_STATE_ONLY'||
    input.systemia_admission!=='NOT_ADMITTED'||
    input.production_authorized!==false||
    input.real_agent_telemetry_verified!==false||
    input.service_delivery_verified!==false||
    input.external_effect_verified!==false||
    input.execution_authority!=='NONE_READ_ONLY')
  hold('artifact claims exceed lab contract');
 const hashes=input.source_event_hashes;
 if(!Array.isArray(hashes)||hashes.length<1||hashes.length>5||input.source_event_count!==hashes.length)
  hold('source hash count invalid');
 for(const row of hashes){
  if(!row||typeof row.event_id!=='string'||!/^[a-zA-Z0-9_.:@/-]{1,160}$/.test(row.event_id)||!hex.test(row.event_sha256))
   hold('invalid source event hash');
 }
 const computed=digest(JSON.stringify(hashes));
 if(computed!==input.source_artifact_sha256)hold('source hash digest mismatch');
 const scope={tenant_id:'evercraft',mission_id:'evercraft-agent-continuity-fabric-20261016',
   incident_id:input.source_incident_id,artifact_sha256:computed};
 const proof=verifyLabChain(input.receipt_chain,input.detached_public_trust,scope);
 if(input.verification?.chain_sha256!==proof.chain_sha256||
    input.verification?.source_artifact_sha256!==computed||
    input.verification?.production_approval!==false||
    input.verification?.provider_effect_verified!==false)
  hold('producer-job detached verifier result mismatched');
 return {
   schema:'evercraft.blackbox.cross-job-artifact-acceptance.v1',
   incident_id:scope.incident_id,source_event_count:hashes.length,
   source_event_hash_manifest_sha256:computed,detached_chain_sha256:proof.chain_sha256,
   github_job_artifact_transfer_consumed:true,
   producer_stage:'CI_EPHEMERAL_LAB',
   consumer_stage:'SEPARATE_GITHUB_ACTIONS_JOB',
   cryptographic_verification:'SAME_ARTIFACT_CHAIN_WITH_CALLER_SUPPLIED_PUBLIC_KEYS',
   independent_provisioned_identity_verified:false,
   live_chum_spider_consumer_verified:false,
   external_provider_effect_verified:false,
   systemia_admission_verified:false,
   execution_authority:'NONE_READ_ONLY'
 };
}
function main(){
 const p=process.argv[2];
 if(!p)hold('path argument missing');
 const raw=readFileSync(resolve(p),'utf8');
 if(Buffer.byteLength(raw)>131072)hold('artifact oversized');
 const answer=consumeDetachedLabArtifact(JSON.parse(raw));
 process.stdout.write(JSON.stringify(answer,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
