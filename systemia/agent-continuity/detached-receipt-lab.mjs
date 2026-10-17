#!/usr/bin/env node
// Build an inspectable four-role LAB receipt chain from the live-owned GitHub
// cohort artifact. Four keys are ephemeral and job-created; they do NOT
// represent independent production services or real delivery receipts.
import {createHash,generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {LAB_STAGES,assembleLabChain} from './detached-receipt-chain.mjs';
const path=process.argv[2]||'/tmp/blackbox-scheduled-cohort.json';
const input=JSON.parse(readFileSync(path,'utf8'));
const incident=input.shared_local_incident;
if(input.schema!=='evercraft.blackbox.github-scheduled-cohort.v1'||
 !incident||!Array.isArray(incident.source_hashes)||incident.source_hashes.length<1||
 incident.source_hashes.length>5||incident.local_source_signature!=='CI_EPHEMERAL_NOT_PRODUCTION_IDENTITY'||
 incident.producer_consumer_receipt_state!=='LOCAL_ONLY'||
 incident.external_verifier_state!=='NOT_PRESENT'||
 incident.source_events_written!==incident.source_hashes.length)
 throw Error('READONLY_LAB_CHAIN_HELD: source cohort lab receipt missing/unsafe');
for(const row of incident.source_hashes){
 if(!/^[a-f0-9]{64}$/.test(row?.event_sha256)||!/^[a-zA-Z0-9_:@/.-]{1,160}$/.test(row?.event_id))
  throw Error('READONLY_LAB_CHAIN_HELD: invalid source hash');
}
const artifact_sha256=createHash('sha256').update(JSON.stringify(incident.source_hashes)).digest('hex');
const tenant_id='evercraft',mission_id='evercraft-agent-continuity-fabric-20261016';
const scope={tenant_id,mission_id,incident_id:incident.packet_incident_id,artifact_sha256};
const roles=[],trust={};
for(const stage of LAB_STAGES){
 const {privateKey,publicKey}=generateKeyPairSync('ed25519'),key_id='lab-'+stage;
 roles.push({stage,key_id,private_key_pem:privateKey.export({type:'pkcs8',format:'pem'})});
 trust[key_id]={public_key_pem:publicKey.export({type:'spki',format:'pem'}),stage,tenant_id,mission_id};
}
const bundle=assembleLabChain({...scope,
 chain_id:'cohort-'+input.observed_at.slice(0,13).replaceAll(':','-'),
 recorded_at:input.observed_at,roles
});
// A separate Node process receives PUBLIC KEYS ONLY, source hash and receipts.
const verifier=fileURLToPath(new URL('./detached-receipt-verify.mjs',import.meta.url));
const result=spawnSync(process.execPath,[verifier],{
 input:JSON.stringify({bundle,trust,scope}),encoding:'utf8',maxBuffer:512*1024,timeout:10000
});
if(result.error||result.status!==0)throw Error('READONLY_LAB_CHAIN_HELD: detached verifier failed: '+String(result.stderr||result.error).slice(0,320));
const independentProcess=JSON.parse(result.stdout);
if(independentProcess.same_artifact!==true||independentProcess.chain_length!==4||
 independentProcess.process_boundary!=='SEPARATE_NODE_PROCESS_ONLY'||
 independentProcess.production_approval!==false||independentProcess.live_service_delivery_verified!==false||
 independentProcess.identity_passport_enrollment_verified!==false||
 independentProcess.provider_effect_verified!==false)
 throw Error('READONLY_LAB_CHAIN_HELD: verifier claim mismatch');
const output={
 schema:'evercraft.blackbox.ci-detached-roles-lab-evidence.v1',
 source_incident_id:scope.incident_id,
 source_event_count:incident.source_hashes.length,
 source_event_hashes:incident.source_hashes,
 source_artifact_sha256:artifact_sha256,
 signer_provisioning:'SAME_CI_JOB_EPHEMERAL_KEY_PAIRS_FOUR_DISTINCT_ROLES',
 producer_delivery_consumer_independence:'NOT_PROVEN',
 verifier_process:'SEPARATE_PROCESS_WITH_PUBLIC_KEY_TRUST',
 original_source_claim:'GITHUB_SCHEDULED_WORKFLOW_RUN_STATE_ONLY',
 trust_source:'EPHEMERAL_PUBLIC_KEYS_EMBEDDED_FOR_REPRODUCIBILITY_NOT_PASSPORT',
 receipt_chain:bundle,
 detached_public_trust:trust,
 verification:independentProcess,
 systemia_admission:'NOT_ADMITTED',
 real_agent_telemetry_verified:false,
 external_effect_verified:false,
 service_delivery_verified:false,
 production_identity_enrolled:false,
 production_authorized:false,
 execution_authority:'NONE_READ_ONLY'
};
process.stdout.write(JSON.stringify(output,null,2)+'\n');
